import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { notFound } from '../util/errors.js';
import type { Variables } from '../context.js';

const app = new Hono<{ Variables: Variables }>();
app.use('*', requireAuth, requireWorkspace('viewer'));

/**
 * Stream an import asset's bytes to the browser.
 *
 * ACL is derived from the parent item: if the item is private to a different
 * user we 404 (same shape as items endpoints — no leaking existence). Cache
 * aggressively since blobs are content-addressed by id and never mutate.
 */
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const m = c.get('membership');
  const user = c.get('user');

  const rows = await db
    .select({
      data: schema.item_assets.data,
      content_type: schema.item_assets.content_type,
      visibility: schema.items.visibility,
      owner_id: schema.items.owner_id,
    })
    .from(schema.item_assets)
    .innerJoin(schema.items, eq(schema.items.id, schema.item_assets.item_id))
    .where(
      and(
        eq(schema.item_assets.id, id),
        eq(schema.item_assets.workspace_id, m.workspace_id),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) throw notFound('asset not found');
  if (row.visibility === 'private' && row.owner_id !== user.id) {
    throw notFound('asset not found');
  }

  // Drizzle returns the bytea column as a Buffer (better-sqlite3 + node-pg both).
  const body = row.data as Buffer;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': row.content_type,
      'Content-Length': String(body.byteLength),
      // Asset IDs are nanoids — content never changes for a given id. Cache hard.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

export default app;
