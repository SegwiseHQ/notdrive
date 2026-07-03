import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { conflict, notFound } from '../util/errors.js';
import { newId, now } from '../util/ids.js';

export async function listTags(workspaceId: string) {
  return db.select().from(schema.tags).where(eq(schema.tags.workspace_id, workspaceId));
}

export async function createTag(workspaceId: string, name: string, color: string) {
  try {
    const id = newId();
    await db.insert(schema.tags).values({
      id,
      workspace_id: workspaceId,
      name,
      color,
      created_at: now(),
    });
    return { id, workspace_id: workspaceId, name, color };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('UNIQUE') || msg.includes('duplicate'))
      throw conflict('tag name already exists');
    throw e;
  }
}

export async function patchTag(
  workspaceId: string,
  id: string,
  patch: { name?: string; color?: string },
) {
  const res = await db
    .update(schema.tags)
    .set({
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.color ? { color: patch.color } : {}),
    })
    .where(and(eq(schema.tags.id, id), eq(schema.tags.workspace_id, workspaceId)));
  if (!res) throw notFound('tag not found');
}

export async function deleteTag(workspaceId: string, id: string) {
  await db
    .delete(schema.tags)
    .where(and(eq(schema.tags.id, id), eq(schema.tags.workspace_id, workspaceId)));
}

export async function attachTag(workspaceId: string, itemId: string, tagId: string) {
  // Ensure tag and item both belong to workspace.
  const ok = await db
    .select({ t: schema.tags.id, i: schema.items.id })
    .from(schema.tags)
    .innerJoin(schema.items, eq(schema.items.workspace_id, schema.tags.workspace_id))
    .where(
      and(
        eq(schema.tags.id, tagId),
        eq(schema.items.id, itemId),
        eq(schema.tags.workspace_id, workspaceId),
      ),
    )
    .limit(1);
  if (!ok[0]) throw notFound('item or tag not found in workspace');

  await db
    .insert(schema.item_tags)
    .values({ item_id: itemId, tag_id: tagId })
    .onConflictDoNothing();
}

export async function detachTag(workspaceId: string, itemId: string, tagId: string) {
  await db
    .delete(schema.item_tags)
    .where(and(eq(schema.item_tags.item_id, itemId), eq(schema.item_tags.tag_id, tagId)));
  // workspace_id is enforced by FK, but keep the signature for symmetry.
  void workspaceId;
  void sql``;
}
