import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { now } from '../util/ids.js';
import { driveClientFor } from './client.js';
import { withDriveLimit } from './limiter.js';

const FIELDS = 'id,name,mimeType,iconLink,thumbnailLink,webViewLink,modifiedTime,trashed,parents';
export const DRIVE_FILE_FIELDS = FIELDS;

export async function fetchAndCacheDriveFile(workspaceId: string, userId: string, fileId: string) {
  const drive = await driveClientFor(userId);
  const res = await withDriveLimit(userId, () =>
    drive.files.get({ fileId, fields: FIELDS, supportsAllDrives: true }),
  );
  const f = res.data;
  const driveFileId = f.id;
  if (!driveFileId) throw new Error('Drive file lookup did not return a file id');
  const modified = f.modifiedTime ? Date.parse(f.modifiedTime) : null;
  await db
    .insert(schema.drive_file_cache)
    .values({
      drive_file_id: driveFileId,
      workspace_id: workspaceId,
      name: f.name ?? '(unnamed)',
      mime_type: f.mimeType ?? 'application/octet-stream',
      icon_link: f.iconLink ?? null,
      thumbnail_link: f.thumbnailLink ?? null,
      web_view_link: f.webViewLink ?? null,
      modified_time: modified,
      trashed: !!f.trashed,
      raw: JSON.stringify(f),
      fetched_at: now(),
    })
    .onConflictDoUpdate({
      target: [schema.drive_file_cache.drive_file_id, schema.drive_file_cache.workspace_id],
      set: {
        name: f.name ?? '(unnamed)',
        mime_type: f.mimeType ?? 'application/octet-stream',
        icon_link: f.iconLink ?? null,
        thumbnail_link: f.thumbnailLink ?? null,
        web_view_link: f.webViewLink ?? null,
        modified_time: modified,
        trashed: !!f.trashed,
        raw: JSON.stringify(f),
        fetched_at: now(),
      },
    });
  return f;
}

export async function getCachedFile(workspaceId: string, fileId: string) {
  const rows = await db
    .select()
    .from(schema.drive_file_cache)
    .where(
      and(
        eq(schema.drive_file_cache.workspace_id, workspaceId),
        eq(schema.drive_file_cache.drive_file_id, fileId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
