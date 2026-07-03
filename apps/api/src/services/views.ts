import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { notFound } from '../util/errors.js';
import { newId, now } from '../util/ids.js';

export async function listViews(workspaceId: string, userId: string) {
  const rows = await db
    .select()
    .from(schema.views)
    .where(and(eq(schema.views.workspace_id, workspaceId), eq(schema.views.user_id, userId)));
  return rows.map((r) => ({
    ...r,
    sort: r.sort ? (typeof r.sort === 'string' ? JSON.parse(r.sort) : r.sort) : null,
  }));
}

export async function createView(
  workspaceId: string,
  userId: string,
  body: { name: string; query: string; layout: string; sort?: unknown },
) {
  const id = newId();
  const ts = now();
  await db.insert(schema.views).values({
    id,
    workspace_id: workspaceId,
    user_id: userId,
    name: body.name,
    query: body.query,
    layout: body.layout,
    sort: body.sort
      ? typeof body.sort === 'string'
        ? body.sort
        : JSON.stringify(body.sort)
      : null,
    created_at: ts,
  });
  return { id, created_at: ts };
}

export async function patchView(
  workspaceId: string,
  userId: string,
  id: string,
  patch: { name?: string; query?: string; layout?: string; sort?: unknown },
) {
  const res = await db
    .update(schema.views)
    .set({
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.query !== undefined ? { query: patch.query } : {}),
      ...(patch.layout ? { layout: patch.layout } : {}),
      ...(patch.sort !== undefined
        ? {
            sort: patch.sort
              ? typeof patch.sort === 'string'
                ? patch.sort
                : JSON.stringify(patch.sort)
              : null,
          }
        : {}),
    })
    .where(
      and(
        eq(schema.views.id, id),
        eq(schema.views.workspace_id, workspaceId),
        eq(schema.views.user_id, userId),
      ),
    );
  if (!res) throw notFound('view not found');
}

export async function deleteView(workspaceId: string, userId: string, id: string) {
  await db
    .delete(schema.views)
    .where(
      and(
        eq(schema.views.id, id),
        eq(schema.views.workspace_id, workspaceId),
        eq(schema.views.user_id, userId),
      ),
    );
}
