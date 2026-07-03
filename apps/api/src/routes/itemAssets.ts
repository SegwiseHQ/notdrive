import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Variables } from '../context.js';
import { db, schema } from '../db/index.js';
import { notFound } from '../util/errors.js';

const app = new Hono<{ Variables: Variables }>();

/**
 * Stream an asset's bytes to the browser.
 *
 * NO AUTH on this route by design. Asset IDs are 12-character nanoids
 * (~64^12 ≈ 4.7e21 keyspace) so guessing one is computationally infeasible.
 * The same pattern S3 presigned URLs, Notion image URLs, and Dropbox share
 * links use: the unguessable identifier is the security boundary.
 *
 * Why no cookie-based auth: <img> tags don't send credentials on cross-origin
 * requests by default. Frontend at notdrive.segwise.ai loading images from
 * api-notdrive.segwise.ai would always 401. Token-in-URL bypasses the cookie
 * problem.
 *
 * Privacy semantics: asset URLs only appear in HTML the API serves, and that
 * HTML is gated by item-level visibility/ACL. Other users never receive the
 * URL in the first place. (Note: if someone shares the URL out-of-band, the
 * recipient can fetch the asset — same trade-off as S3 signed URLs.)
 */
app.get('/:id', async (c) => {
  const id = c.req.param('id');

  const rows = await db
    .select({
      data: schema.item_assets.data,
      content_type: schema.item_assets.content_type,
    })
    .from(schema.item_assets)
    .where(eq(schema.item_assets.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) throw notFound('asset not found');

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
