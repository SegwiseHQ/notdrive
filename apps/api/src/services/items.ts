import { INITIAL_RANK, between } from '@notdrive/shared';
import type { ItemDTO } from '@notdrive/shared';
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { deleteBlob, pullBody, pushBody } from '../drive/appdata.js';
import { badRequest, notFound } from '../util/errors.js';
import { newId, now } from '../util/ids.js';
import { logger } from '../util/logger.js';
import { getWorkspaceAutoShare, shareFileWithMembers } from './autoShare.js';

export interface ItemCreateArgs {
  workspaceId: string;
  userId: string;
  type: 'page' | 'file';
  title: string;
  parentId: string | null;
  driveFileId: string | null;
  body?: string | null;
}

async function lastSiblingRank(workspaceId: string, parentId: string | null): Promise<string | undefined> {
  const rows = await db
    .select({ rank: schema.items.rank })
    .from(schema.items)
    .where(
      and(
        eq(schema.items.workspace_id, workspaceId),
        parentId === null ? isNull(schema.items.parent_id) : eq(schema.items.parent_id, parentId),
      ),
    )
    .orderBy(desc(schema.items.rank))
    .limit(1);
  return rows[0]?.rank;
}

export async function createItem(args: ItemCreateArgs): Promise<string> {
  const id = newId();
  const ts = now();
  const last = await lastSiblingRank(args.workspaceId, args.parentId);
  const rank = between(last, undefined) || INITIAL_RANK;

  await db.transaction(async (tx) => {
    await tx.insert(schema.items).values({
      id,
      workspace_id: args.workspaceId,
      type: args.type,
      title: args.title,
      drive_file_id: args.driveFileId,
      parent_id: args.parentId,
      rank,
      is_favorite: false,
      is_archived: false,
      archived_at: null,
      body: args.body ?? null,
      created_by: args.userId,
      created_at: ts,
      updated_at: ts,
    });
    await tx.insert(schema.item_events).values({
      id: newId(),
      workspace_id: args.workspaceId,
      user_id: args.userId,
      item_id: id,
      kind: 'created',
      reason: null,
      created_at: ts,
    });
  });
  if (args.driveFileId) {
    void maybeAutoShare(args.workspaceId, args.driveFileId, args.userId);
  }
  return id;
}

async function requireItem(workspaceId: string, id: string) {
  const rows = await db
    .select()
    .from(schema.items)
    .where(and(eq(schema.items.id, id), eq(schema.items.workspace_id, workspaceId)))
    .limit(1);
  if (!rows[0]) throw notFound('item not found');
  return rows[0];
}

export async function patchItem(
  workspaceId: string,
  userId: string,
  id: string,
  patch: { title?: string; is_favorite?: boolean; body?: string | null },
) {
  const existing = await requireItem(workspaceId, id);
  const ts = now();
  await db
    .update(schema.items)
    .set({
      title: patch.title ?? existing.title,
      is_favorite: patch.is_favorite ?? existing.is_favorite,
      body: patch.body !== undefined ? patch.body : existing.body,
      updated_at: ts,
    })
    .where(eq(schema.items.id, id));
  await db.insert(schema.item_events).values({
    id: newId(),
    workspace_id: workspaceId,
    user_id: userId,
    item_id: id,
    kind: 'updated',
    reason: null,
    created_at: ts,
  });

  // Mirror body into the user's Drive appDataFolder for durability.
  // Fire-and-forget so page saves stay snappy. Skip if the body didn't
  // actually change — the debounced editor sometimes fires with identical HTML.
  if (patch.body !== undefined && patch.body !== existing.body) {
    void mirrorBodyToAppData(userId, id, patch.body ?? '', existing.appdata_file_id ?? null);
  }
}

async function mirrorBodyToAppData(
  userId: string,
  itemId: string,
  body: string,
  existingFileId: string | null,
) {
  try {
    const fileId = await pushBody(userId, itemId, body, existingFileId);
    if (fileId !== existingFileId) {
      await db
        .update(schema.items)
        .set({ appdata_file_id: fileId })
        .where(eq(schema.items.id, itemId));
    }
  } catch (err) {
    // Non-fatal — DB is still source of truth.
    logger.warn({ itemId, err: (err as Error).message }, 'appdata mirror failed');
  }
}

export async function moveItem(
  workspaceId: string,
  userId: string,
  id: string,
  args: { parent_id: string | null; before_id?: string; after_id?: string },
) {
  await requireItem(workspaceId, id);
  if (args.parent_id === id) throw badRequest('cannot parent item to itself');
  if (args.parent_id) {
    // Guard against cycles: walk up parents until null or hit id.
    let cursor: string | null = args.parent_id;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === id) throw badRequest('cycle detected');
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const row = await db
        .select({ p: schema.items.parent_id })
        .from(schema.items)
        .where(and(eq(schema.items.id, cursor), eq(schema.items.workspace_id, workspaceId)))
        .limit(1);
      cursor = row[0]?.p ?? null;
    }
  }

  // Compute new rank.
  const siblings = await db
    .select({ id: schema.items.id, rank: schema.items.rank })
    .from(schema.items)
    .where(
      and(
        eq(schema.items.workspace_id, workspaceId),
        args.parent_id === null ? isNull(schema.items.parent_id) : eq(schema.items.parent_id, args.parent_id),
      ),
    )
    .orderBy(asc(schema.items.rank));
  const filtered = siblings.filter((s) => s.id !== id);

  let prev: string | undefined;
  let next: string | undefined;
  if (args.before_id) {
    const idx = filtered.findIndex((s) => s.id === args.before_id);
    if (idx < 0) throw badRequest('before_id not a sibling');
    next = filtered[idx]?.rank;
    prev = idx > 0 ? filtered[idx - 1]?.rank : undefined;
  } else if (args.after_id) {
    const idx = filtered.findIndex((s) => s.id === args.after_id);
    if (idx < 0) throw badRequest('after_id not a sibling');
    prev = filtered[idx]?.rank;
    next = idx + 1 < filtered.length ? filtered[idx + 1]?.rank : undefined;
  } else {
    prev = filtered[filtered.length - 1]?.rank;
  }
  const rank = between(prev, next);
  const ts = now();

  await db
    .update(schema.items)
    .set({ parent_id: args.parent_id, rank, updated_at: ts })
    .where(eq(schema.items.id, id));
}

export async function archiveItem(workspaceId: string, userId: string, id: string, reason?: string) {
  const ts = now();
  await db
    .update(schema.items)
    .set({ is_archived: true, archived_at: ts, updated_at: ts })
    .where(and(eq(schema.items.id, id), eq(schema.items.workspace_id, workspaceId)));
  await db.insert(schema.item_events).values({
    id: newId(),
    workspace_id: workspaceId,
    user_id: userId,
    item_id: id,
    kind: 'archived',
    reason: reason ?? null,
    created_at: ts,
  });
}

export async function restoreItem(workspaceId: string, userId: string, id: string) {
  const ts = now();
  await db
    .update(schema.items)
    .set({ is_archived: false, archived_at: null, updated_at: ts })
    .where(and(eq(schema.items.id, id), eq(schema.items.workspace_id, workspaceId)));
  await db.insert(schema.item_events).values({
    id: newId(),
    workspace_id: workspaceId,
    user_id: userId,
    item_id: id,
    kind: 'restored',
    reason: null,
    created_at: ts,
  });
}

export async function purgeItem(workspaceId: string, userId: string, id: string) {
  const r = await requireItem(workspaceId, id);
  if (!r.is_archived) throw badRequest('item must be archived before purge');
  if (r.appdata_file_id) {
    void deleteBlob(userId, r.appdata_file_id);
  }
  await db.delete(schema.items).where(eq(schema.items.id, id));
}

export async function restoreBodyFromAppData(workspaceId: string, userId: string, id: string) {
  const r = await requireItem(workspaceId, id);
  if (!r.appdata_file_id) throw badRequest('no appData backup for this page');
  const body = await pullBody(userId, r.appdata_file_id);
  if (body === null) throw badRequest('appData blob not readable');
  await db.update(schema.items).set({ body, updated_at: now() }).where(eq(schema.items.id, id));
  return body;
}

export async function linkDriveFile(
  workspaceId: string,
  userId: string,
  id: string,
  driveFileId: string,
) {
  const ts = now();
  await db
    .update(schema.items)
    .set({ drive_file_id: driveFileId, type: 'file', updated_at: ts })
    .where(and(eq(schema.items.id, id), eq(schema.items.workspace_id, workspaceId)));
  await db.insert(schema.item_events).values({
    id: newId(),
    workspace_id: workspaceId,
    user_id: userId,
    item_id: id,
    kind: 'linked',
    reason: null,
    created_at: ts,
  });

  void maybeAutoShare(workspaceId, driveFileId, userId);
}

async function maybeAutoShare(workspaceId: string, driveFileId: string, granterId: string) {
  try {
    const cfg = await getWorkspaceAutoShare(workspaceId);
    if (!cfg || cfg.mode === 'off') return;
    await shareFileWithMembers(workspaceId, driveFileId, granterId, cfg.mode, cfg.role);
  } catch (err) {
    logger.warn({ err: (err as Error).message, driveFileId }, 'maybeAutoShare failed');
  }
}

export async function unlinkDriveFile(workspaceId: string, userId: string, id: string) {
  const ts = now();
  await db
    .update(schema.items)
    .set({ drive_file_id: null, type: 'page', updated_at: ts })
    .where(and(eq(schema.items.id, id), eq(schema.items.workspace_id, workspaceId)));
  await db.insert(schema.item_events).values({
    id: newId(),
    workspace_id: workspaceId,
    user_id: userId,
    item_id: id,
    kind: 'unlinked',
    reason: null,
    created_at: ts,
  });
}

export async function recordOpen(workspaceId: string, userId: string, id: string) {
  await db.insert(schema.item_events).values({
    id: newId(),
    workspace_id: workspaceId,
    user_id: userId,
    item_id: id,
    kind: 'opened',
    reason: null,
    created_at: now(),
  });
}

export async function listItems(
  workspaceId: string,
  q: {
    parent_id?: string;
    root?: boolean;
    archived?: boolean;
    favorite?: boolean;
    linked_only?: boolean;
    limit: number;
  },
): Promise<ItemDTO[]> {
  const conds = [eq(schema.items.workspace_id, workspaceId)];
  if (q.root) conds.push(isNull(schema.items.parent_id));
  else if (q.parent_id) conds.push(eq(schema.items.parent_id, q.parent_id));
  if (q.archived !== undefined) conds.push(eq(schema.items.is_archived, q.archived));
  if (q.favorite) conds.push(eq(schema.items.is_favorite, true));
  if (q.linked_only) conds.push(isNotNull(schema.items.drive_file_id));

  const rows = await db
    .select()
    .from(schema.items)
    .where(and(...conds))
    .orderBy(asc(schema.items.rank))
    .limit(q.limit);

  return hydrate(workspaceId, rows);
}

export async function hydrate(workspaceId: string, rows: (typeof schema.items.$inferSelect)[]): Promise<ItemDTO[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const driveIds = rows.map((r) => r.drive_file_id).filter((x): x is string => !!x);

  const tagLinks = await db
    .select()
    .from(schema.item_tags)
    .where(inArray(schema.item_tags.item_id, ids));
  const tagMap = new Map<string, string[]>();
  for (const t of tagLinks) {
    const arr = tagMap.get(t.item_id) ?? [];
    arr.push(t.tag_id);
    tagMap.set(t.item_id, arr);
  }

  const drives = driveIds.length
    ? await db
        .select()
        .from(schema.drive_file_cache)
        .where(
          and(
            eq(schema.drive_file_cache.workspace_id, workspaceId),
            inArray(schema.drive_file_cache.drive_file_id, driveIds),
          ),
        )
    : [];
  const driveMap = new Map(drives.map((d) => [d.drive_file_id, d]));

  return rows.map((r) => ({
    id: r.id,
    workspace_id: r.workspace_id,
    type: r.type as 'page' | 'file',
    title: r.title,
    parent_id: r.parent_id,
    drive_file_id: r.drive_file_id,
    rank: r.rank,
    is_favorite: r.is_favorite,
    is_archived: r.is_archived,
    archived_at: r.archived_at,
    body: r.body ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    tag_ids: tagMap.get(r.id) ?? [],
    drive:
      r.drive_file_id && driveMap.has(r.drive_file_id)
        ? toDriveDto(driveMap.get(r.drive_file_id)!)
        : null,
  }));
}

function toDriveDto(d: typeof schema.drive_file_cache.$inferSelect) {
  return {
    drive_file_id: d.drive_file_id,
    name: d.name,
    mime_type: d.mime_type,
    icon_link: d.icon_link,
    thumbnail_link: d.thumbnail_link,
    web_view_link: d.web_view_link,
    modified_time: d.modified_time,
    trashed: d.trashed,
  };
}

export async function getItem(workspaceId: string, id: string): Promise<ItemDTO> {
  const r = await requireItem(workspaceId, id);
  const [dto] = await hydrate(workspaceId, [r]);
  return dto!;
}
