import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { archiveItem } from '../services/items.js';
import { now } from '../util/ids.js';
import { logger } from '../util/logger.js';
import { driveClientFor } from './client.js';
import { withDriveLimit } from './limiter.js';
import { invalidateTreeCache } from './tree.js';

const FIELDS =
  'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,iconLink,thumbnailLink,webViewLink,modifiedTime,trashed))';

async function readState(workspaceId: string, userId: string) {
  const rows = await db
    .select()
    .from(schema.drive_sync_state)
    .where(
      and(
        eq(schema.drive_sync_state.workspace_id, workspaceId),
        eq(schema.drive_sync_state.user_id, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function writeState(workspaceId: string, userId: string, token: string | null) {
  await db
    .insert(schema.drive_sync_state)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      start_page_token: token,
      last_polled_at: now(),
    })
    .onConflictDoUpdate({
      target: [schema.drive_sync_state.workspace_id, schema.drive_sync_state.user_id],
      set: { start_page_token: token, last_polled_at: now() },
    });
}

export async function syncChanges(workspaceId: string, userId: string) {
  const drive = await driveClientFor(userId);
  let state = await readState(workspaceId, userId);
  if (!state?.start_page_token) {
    const tok = await withDriveLimit(userId, () => drive.changes.getStartPageToken({}));
    await writeState(workspaceId, userId, tok.data.startPageToken ?? null);
    state = await readState(workspaceId, userId);
    if (!state?.start_page_token) return { processed: 0 };
  }

  let pageToken: string | undefined = state.start_page_token ?? undefined;
  let processed = 0;
  while (pageToken) {
    const res = await withDriveLimit(userId, () =>
      drive.changes.list({
        pageToken,
        fields: FIELDS,
        pageSize: 200,
        restrictToMyDrive: false,
        includeRemoved: true,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      }),
    );
    for (const ch of res.data.changes ?? []) {
      await applyChange(workspaceId, userId, ch);
      processed++;
    }
    if (res.data.nextPageToken) {
      pageToken = res.data.nextPageToken;
    } else {
      await writeState(workspaceId, userId, res.data.newStartPageToken ?? null);
      pageToken = undefined;
    }
  }
  // If any change came through, the cached tree is stale.
  if (processed > 0) invalidateTreeCache(userId);
  return { processed };
}

async function applyChange(
  workspaceId: string,
  userId: string,
  ch: {
    fileId?: string | null;
    removed?: boolean | null;
    file?: {
      id?: string | null;
      name?: string | null;
      mimeType?: string | null;
      iconLink?: string | null;
      thumbnailLink?: string | null;
      webViewLink?: string | null;
      modifiedTime?: string | null;
      trashed?: boolean | null;
    } | null;
  },
) {
  const fileId = ch.fileId ?? ch.file?.id;
  if (!fileId) return;
  const trashedOrRemoved = !!ch.removed || !!ch.file?.trashed;

  if (ch.file && !ch.removed) {
    await db
      .insert(schema.drive_file_cache)
      .values({
        drive_file_id: fileId,
        workspace_id: workspaceId,
        name: ch.file.name ?? '(unnamed)',
        mime_type: ch.file.mimeType ?? 'application/octet-stream',
        icon_link: ch.file.iconLink ?? null,
        thumbnail_link: ch.file.thumbnailLink ?? null,
        web_view_link: ch.file.webViewLink ?? null,
        modified_time: ch.file.modifiedTime ? Date.parse(ch.file.modifiedTime) : null,
        trashed: !!ch.file.trashed,
        raw: JSON.stringify(ch.file),
        fetched_at: now(),
      })
      .onConflictDoUpdate({
        target: [schema.drive_file_cache.drive_file_id, schema.drive_file_cache.workspace_id],
        set: {
          name: ch.file.name ?? '(unnamed)',
          mime_type: ch.file.mimeType ?? 'application/octet-stream',
          icon_link: ch.file.iconLink ?? null,
          thumbnail_link: ch.file.thumbnailLink ?? null,
          web_view_link: ch.file.webViewLink ?? null,
          modified_time: ch.file.modifiedTime ? Date.parse(ch.file.modifiedTime) : null,
          trashed: !!ch.file.trashed,
          raw: JSON.stringify(ch.file),
          fetched_at: now(),
        },
      });
  }

  if (trashedOrRemoved) {
    const linked = await db
      .select()
      .from(schema.items)
      .where(
        and(
          eq(schema.items.workspace_id, workspaceId),
          eq(schema.items.drive_file_id, fileId),
          eq(schema.items.is_archived, false),
        ),
      );
    for (const it of linked) {
      await archiveItem(workspaceId, userId, it.id, 'drive_trashed');
      logger.info({ itemId: it.id, fileId }, 'auto-archived on drive trash');
    }
  }
}
