import { INITIAL_RANK, between } from '@notdrive/shared';
import type { ItemDTO } from '@notdrive/shared';
import { and, asc, desc, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { deleteBlob, pullBody, pushBody } from '../drive/appdata.js';
import { badRequest, notFound } from '../util/errors.js';
import { newId, now } from '../util/ids.js';
import { logger } from '../util/logger.js';
import { getWorkspaceAutoShare, shareFileWithMembers } from './autoShare.js';
import { publishItemEvent } from './itemStream.js';

export interface ItemCreateArgs {
  workspaceId: string;
  userId: string;
  type: 'page' | 'file';
  title: string;
  parentId: string | null;
  driveFileId: string | null;
  body?: string | null;
  // When omitted on a root item, defaults to 'workspace'. When omitted on a
  // child, inherits from the parent. Pass 'private' explicitly to make a
  // top-level item private to the creating user.
  visibility?: 'workspace' | 'private';
}

/**
 * SQL predicate restricting items to those the user is allowed to see:
 * either workspace-visible, or private-but-owned-by-this-user. Drop into
 * any items query's WHERE clause via `and(...)`.
 *
 * `or(...)` only returns undefined when called with zero args; with our two
 * fixed args the result is always defined, so the narrowing cast is safe.
 */
export function visibilityClause(userId: string) {
  const clause = or(
    eq(schema.items.visibility, 'workspace'),
    and(eq(schema.items.visibility, 'private'), eq(schema.items.owner_id, userId)),
  );
  if (!clause) throw new Error('visibilityClause: or() produced undefined');
  return clause;
}

/**
 * Fetch a parent item's visibility + owner_id. Returns null if the parent
 * doesn't exist or isn't reachable by the caller (private + owned by someone
 * else). Callers that want to inherit from the parent must treat null as
 * "no parent" — preventing privilege escalation via guessed parent ids.
 */
async function getParentVisibility(
  workspaceId: string,
  userId: string,
  parentId: string,
): Promise<{ visibility: 'workspace' | 'private'; owner_id: string | null } | null> {
  const rows = await db
    .select({ visibility: schema.items.visibility, owner_id: schema.items.owner_id })
    .from(schema.items)
    .where(and(eq(schema.items.id, parentId), eq(schema.items.workspace_id, workspaceId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // Hide private parents the caller doesn't own.
  if (row.visibility === 'private' && row.owner_id !== userId) return null;
  return { visibility: row.visibility as 'workspace' | 'private', owner_id: row.owner_id };
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

  // If a parent was specified, fetch it through the visibility-aware helper.
  // This both gives us the parent's visibility for inheritance AND rejects
  // attempts to create children under a private parent the caller can't see.
  let parent: Awaited<ReturnType<typeof getParentVisibility>> = null;
  if (args.parentId) {
    parent = await getParentVisibility(args.workspaceId, args.userId, args.parentId);
    if (!parent) throw notFound('parent item not found');
  }

  // Visibility inheritance:
  //   - explicit args.visibility wins
  //   - else if there's a parent, inherit its visibility + owner_id
  //   - else default to 'workspace' (everyone can see)
  let visibility: 'workspace' | 'private' = 'workspace';
  let ownerId: string | null = null;
  if (args.visibility) {
    visibility = args.visibility;
    if (visibility === 'private') ownerId = args.userId;
  } else if (parent?.visibility === 'private') {
    visibility = 'private';
    ownerId = parent.owner_id ?? args.userId;
  }

  await db.transaction(async (tx) => {
    await tx.insert(schema.items).values({
      id,
      workspace_id: args.workspaceId,
      type: args.type,
      title: args.title,
      drive_file_id: args.driveFileId,
      parent_id: args.parentId,
      rank,
      is_archived: false,
      archived_at: null,
      body: args.body ?? null,
      visibility,
      owner_id: ownerId,
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
  // Private pages don't auto-share their Drive file — the whole point of
  // private visibility is that other workspace members don't see this content.
  // Sharing the underlying Drive file would leak the file even though the page
  // is hidden.
  if (args.driveFileId && visibility !== 'private') {
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

/**
 * Like requireItem but also enforces that the caller can see this item.
 * Use this on read paths. Mutation paths (patch/move/archive/etc.) use the
 * looser requireItem followed by an explicit owner check via assertCanMutate.
 */
export async function requireVisibleItem(workspaceId: string, userId: string, id: string) {
  const row = await requireItem(workspaceId, id);
  if (row.visibility === 'private' && row.owner_id !== userId) {
    throw notFound('item not found');
  }
  return row;
}

function assertCanMutate(row: typeof schema.items.$inferSelect, userId: string) {
  if (row.visibility === 'private' && row.owner_id !== userId) {
    throw notFound('item not found');
  }
}

/**
 * BFS over parent_id to collect every descendant of `rootId` in the workspace.
 * Used when flipping visibility — the whole subtree must move together so we
 * never end up with a private parent containing workspace-visible children.
 */
async function collectDescendantIds(workspaceId: string, rootId: string): Promise<string[]> {
  const all: string[] = [];
  let frontier = [rootId];
  while (frontier.length) {
    const children = await db
      .select({ id: schema.items.id })
      .from(schema.items)
      .where(
        and(
          eq(schema.items.workspace_id, workspaceId),
          inArray(schema.items.parent_id, frontier),
        ),
      );
    if (children.length === 0) break;
    const ids = children.map((r) => r.id);
    all.push(...ids);
    frontier = ids;
  }
  return all;
}

/**
 * Apply a (visibility, owner_id) pair to every descendant of `rootId`.
 * Called by patchItem and moveItem whenever the root's visibility changes —
 * private/workspace state must propagate to the whole subtree atomically so
 * the parent_id chain never crosses a visibility boundary.
 */
async function cascadeVisibility(
  workspaceId: string,
  rootId: string,
  visibility: 'workspace' | 'private',
  ownerId: string | null,
  ts: number,
) {
  const descendants = await collectDescendantIds(workspaceId, rootId);
  if (descendants.length === 0) return;
  await db
    .update(schema.items)
    .set({ visibility, owner_id: ownerId, updated_at: ts })
    .where(inArray(schema.items.id, descendants));
}

export async function patchItem(
  workspaceId: string,
  userId: string,
  id: string,
  patch: {
    title?: string;
    is_favorite?: boolean;
    body?: string | null;
    visibility?: 'workspace' | 'private';
  },
) {
  const existing = await requireItem(workspaceId, id);
  assertCanMutate(existing, userId);
  const ts = now();

  // is_favorite is per-user; route it to user_item_favorites rather than items.
  if (patch.is_favorite !== undefined) {
    if (patch.is_favorite) {
      await db
        .insert(schema.user_item_favorites)
        .values({ workspace_id: workspaceId, user_id: userId, item_id: id, created_at: ts })
        .onConflictDoNothing();
    } else {
      await db
        .delete(schema.user_item_favorites)
        .where(
          and(
            eq(schema.user_item_favorites.user_id, userId),
            eq(schema.user_item_favorites.item_id, id),
          ),
        );
    }
  }

  // Only run the items UPDATE if something on items actually changed.
  if (
    patch.title !== undefined ||
    patch.body !== undefined ||
    patch.visibility !== undefined
  ) {
    const newVisibility = patch.visibility ?? existing.visibility;
    const newOwnerId =
      patch.visibility === undefined
        ? existing.owner_id
        : patch.visibility === 'private'
        ? userId
        : null;
    await db
      .update(schema.items)
      .set({
        title: patch.title ?? existing.title,
        body: patch.body !== undefined ? patch.body : existing.body,
        visibility: newVisibility,
        owner_id: newOwnerId,
        updated_at: ts,
      })
      .where(eq(schema.items.id, id));

    // If visibility flipped, cascade to all descendants so the whole subtree
    // stays consistent (child rows inherit parent's visibility at create time;
    // a later flip needs to push down).
    if (patch.visibility !== undefined && patch.visibility !== existing.visibility) {
      await cascadeVisibility(workspaceId, id, newVisibility, newOwnerId, ts);
    }
  }
  await db.insert(schema.item_events).values({
    id: newId(),
    workspace_id: workspaceId,
    user_id: userId,
    item_id: id,
    kind: 'updated',
    reason: null,
    created_at: ts,
  });
  publishItemEvent(id, { kind: 'updated', by: userId, at: ts });

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
  const existing = await requireItem(workspaceId, id);
  assertCanMutate(existing, userId);
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

  // Reject moves into a parent the caller can't see (otherwise a member who
  // guesses a private parent id could donate items into someone else's tree).
  // If the new parent is private, force this item + all descendants to inherit.
  // Moving under a workspace parent leaves visibility alone (private items stay
  // private until the owner explicitly flips them).
  let inheritedVisibility: 'workspace' | 'private' | null = null;
  let inheritedOwnerId: string | null = null;
  if (args.parent_id) {
    const parent = await getParentVisibility(workspaceId, userId, args.parent_id);
    if (!parent) throw notFound('parent item not found');
    if (parent.visibility === 'private') {
      inheritedVisibility = 'private';
      inheritedOwnerId = parent.owner_id ?? userId;
    }
  }

  await db
    .update(schema.items)
    .set({
      parent_id: args.parent_id,
      rank,
      updated_at: ts,
      ...(inheritedVisibility
        ? { visibility: inheritedVisibility, owner_id: inheritedOwnerId }
        : {}),
    })
    .where(eq(schema.items.id, id));

  if (inheritedVisibility) {
    await cascadeVisibility(workspaceId, id, inheritedVisibility, inheritedOwnerId, ts);
  }
  publishItemEvent(id, { kind: 'moved', by: userId, at: ts });
}

export async function archiveItem(workspaceId: string, userId: string, id: string, reason?: string) {
  const existing = await requireItem(workspaceId, id);
  assertCanMutate(existing, userId);
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
  publishItemEvent(id, { kind: 'archived', by: userId, at: ts });
}

export async function restoreItem(workspaceId: string, userId: string, id: string) {
  const existing = await requireItem(workspaceId, id);
  assertCanMutate(existing, userId);
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
  publishItemEvent(id, { kind: 'restored', by: userId, at: ts });
}

export async function purgeItem(workspaceId: string, userId: string, id: string) {
  const r = await requireItem(workspaceId, id);
  assertCanMutate(r, userId);
  if (!r.is_archived) throw badRequest('item must be archived before purge');
  if (r.appdata_file_id) {
    void deleteBlob(userId, r.appdata_file_id);
  }
  await db.delete(schema.items).where(eq(schema.items.id, id));
}

/**
 * Deep-clone an item and its entire subtree. Asset bytes are copied (not
 * shared) so the duplicate stays intact even if the original is later
 * deleted. Body HTML is rewritten so any /item-assets/:oldId references
 * point at the new asset ids.
 *
 * Visibility/owner: a duplicate mirrors the source's visibility. If source
 * was private, the duplicate is private to the duplicating user (you own
 * your copy of someone else's workspace-visible page; you keep ownership
 * of duplicates of your own private pages).
 *
 * Root gets a "Copy of " prefix on its title. Descendants keep their
 * original titles since the user is duplicating a labeled subtree.
 *
 * Returns the id of the new root.
 */
export async function duplicateItem(
  workspaceId: string,
  userId: string,
  sourceId: string,
): Promise<string> {
  const source = await requireVisibleItem(workspaceId, userId, sourceId);

  // Load source + every descendant.
  const descendantIds = await collectDescendantIds(workspaceId, sourceId);
  const allOldIds = [sourceId, ...descendantIds];
  const oldItems = await db
    .select()
    .from(schema.items)
    .where(and(eq(schema.items.workspace_id, workspaceId), inArray(schema.items.id, allOldIds)));

  // Map old item ids -> new ids.
  const idMap = new Map<string, string>();
  for (const r of oldItems) idMap.set(r.id, newId());

  // Load every item_asset for the subtree; copy bytes with fresh ids.
  const oldAssets = oldItems.length
    ? await db
        .select()
        .from(schema.item_assets)
        .where(inArray(schema.item_assets.item_id, allOldIds))
    : [];
  const assetIdMap = new Map<string, string>();
  for (const a of oldAssets) assetIdMap.set(a.id, newId());

  // Tags carried over so the duplicate inherits classification.
  const tagLinks = allOldIds.length
    ? await db
        .select()
        .from(schema.item_tags)
        .where(inArray(schema.item_tags.item_id, allOldIds))
    : [];

  // Root sibling-rank: append after the source's existing siblings so the
  // duplicate appears near the original. (Sidebar tree currently sorts
  // alphabetically anyway, but ranks need to be unique among siblings.)
  const lastRank = await lastSiblingRank(workspaceId, source.parent_id);
  const rootRank = between(lastRank, undefined) || INITIAL_RANK;

  const ts = now();
  const newRootId = idMap.get(sourceId)!;

  await db.transaction(async (tx) => {
    for (const old of oldItems) {
      const isRoot = old.id === sourceId;
      const newRowId = idMap.get(old.id)!;
      // Descendant ranks are unique within their original sub-tree; reusing
      // them under the new parent is safe since they only collide with
      // their fellow new descendants (same sub-tree mapping).
      const newParentId = isRoot
        ? old.parent_id
        : old.parent_id
          ? (idMap.get(old.parent_id) ?? null)
          : null;
      await tx.insert(schema.items).values({
        id: newRowId,
        workspace_id: workspaceId,
        type: old.type,
        title: isRoot ? `Copy of ${old.title}` : old.title,
        drive_file_id: old.drive_file_id,
        parent_id: newParentId,
        rank: isRoot ? rootRank : old.rank,
        is_archived: false,
        archived_at: null,
        body: rewriteAssetIds(old.body, assetIdMap),
        // appdata_file_id is owned by the original; the duplicate gets a
        // fresh entry the next time the user edits and the mirror fires.
        visibility: old.visibility,
        owner_id: old.visibility === 'private' ? userId : null,
        created_by: userId,
        created_at: ts,
        updated_at: ts,
      });
      await tx.insert(schema.item_events).values({
        id: newId(),
        workspace_id: workspaceId,
        user_id: userId,
        item_id: newRowId,
        kind: 'created',
        reason: 'duplicated',
        created_at: ts,
      });
    }

    for (const a of oldAssets) {
      await tx.insert(schema.item_assets).values({
        id: assetIdMap.get(a.id)!,
        workspace_id: workspaceId,
        item_id: idMap.get(a.item_id)!,
        content_type: a.content_type,
        byte_size: a.byte_size,
        data: a.data,
        created_at: ts,
      });
    }

    for (const t of tagLinks) {
      const newItemId = idMap.get(t.item_id);
      if (newItemId) {
        await tx.insert(schema.item_tags).values({
          item_id: newItemId,
          tag_id: t.tag_id,
        });
      }
    }
  });

  logger.info(
    { sourceId, newRootId, items: oldItems.length, assets: oldAssets.length },
    'duplicated item subtree',
  );
  return newRootId;
}

/**
 * Replace every `/item-assets/<oldId>` occurrence in `body` with the new id
 * from `idMap`. Used by duplicateItem to keep <img> tags pointing at the
 * copy's own asset rows rather than the original's.
 */
function rewriteAssetIds(body: string | null, idMap: Map<string, string>): string | null {
  if (!body || idMap.size === 0) return body;
  let out = body;
  for (const [oldAssetId, newAssetId] of idMap) {
    out = out.split(`/item-assets/${oldAssetId}`).join(`/item-assets/${newAssetId}`);
  }
  return out;
}

export async function restoreBodyFromAppData(workspaceId: string, userId: string, id: string) {
  const r = await requireItem(workspaceId, id);
  assertCanMutate(r, userId);
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
  const existing = await requireItem(workspaceId, id);
  assertCanMutate(existing, userId);
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
  publishItemEvent(id, { kind: 'linked', by: userId, at: ts });

  // Same guard as createItem: don't auto-share Drive files attached to private pages.
  if (existing.visibility !== 'private') {
    void maybeAutoShare(workspaceId, driveFileId, userId);
  }
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
  const existing = await requireItem(workspaceId, id);
  assertCanMutate(existing, userId);
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
  publishItemEvent(id, { kind: 'unlinked', by: userId, at: ts });
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
  userId: string,
  q: {
    parent_id?: string;
    root?: boolean;
    archived?: boolean;
    favorite?: boolean;
    linked_only?: boolean;
    limit: number;
  },
): Promise<ItemDTO[]> {
  const conds = [eq(schema.items.workspace_id, workspaceId), visibilityClause(userId)];
  if (q.root) conds.push(isNull(schema.items.parent_id));
  else if (q.parent_id) conds.push(eq(schema.items.parent_id, q.parent_id));
  if (q.archived !== undefined) conds.push(eq(schema.items.is_archived, q.archived));
  if (q.linked_only) conds.push(isNotNull(schema.items.drive_file_id));

  if (q.favorite) {
    // Restrict to items the current user has starred.
    const favIds = await db
      .select({ item_id: schema.user_item_favorites.item_id })
      .from(schema.user_item_favorites)
      .where(
        and(
          eq(schema.user_item_favorites.workspace_id, workspaceId),
          eq(schema.user_item_favorites.user_id, userId),
        ),
      );
    const ids = favIds.map((r) => r.item_id);
    if (ids.length === 0) return [];
    conds.push(inArray(schema.items.id, ids));
  }

  const rows = await db
    .select()
    .from(schema.items)
    .where(and(...conds))
    .orderBy(asc(schema.items.rank))
    .limit(q.limit);

  return hydrate(workspaceId, userId, rows);
}

export async function hydrate(
  workspaceId: string,
  userId: string,
  rows: (typeof schema.items.$inferSelect)[],
): Promise<ItemDTO[]> {
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

  // Per-user is_favorite: pull the rows the current user has starred.
  const favRows = await db
    .select({ item_id: schema.user_item_favorites.item_id })
    .from(schema.user_item_favorites)
    .where(
      and(
        eq(schema.user_item_favorites.user_id, userId),
        inArray(schema.user_item_favorites.item_id, ids),
      ),
    );
  const favSet = new Set(favRows.map((r) => r.item_id));

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
    is_favorite: favSet.has(r.id),
    is_archived: r.is_archived,
    archived_at: r.archived_at,
    body: r.body ?? null,
    visibility: (r.visibility as 'workspace' | 'private') ?? 'workspace',
    owner_id: r.owner_id,
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

export async function getItem(workspaceId: string, userId: string, id: string): Promise<ItemDTO> {
  const r = await requireVisibleItem(workspaceId, userId, id);
  const [dto] = await hydrate(workspaceId, userId, [r]);
  return dto!;
}
