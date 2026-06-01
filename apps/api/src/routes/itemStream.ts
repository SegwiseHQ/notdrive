import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { getItem } from '../services/items.js';
import { subscribeToItem } from '../services/itemStream.js';
import type { Variables } from '../context.js';

const app = new Hono<{ Variables: Variables }>();
app.use('*', requireAuth, requireWorkspace('viewer'));

/**
 * Live updates for a single item — server-sent events.
 *
 * Wire format: one `data: {json}\n\n` line per event. Frontend uses EventSource
 * to subscribe; events fire whenever someone patches/moves/archives/etc. the
 * item via the API.
 *
 * Access control: same visibility check as GET /items/:id — if the caller
 * can't see the item right now, the stream 404s. We don't re-check on every
 * event because visibility flips (private<->workspace) emit an 'updated'
 * event the client should handle by refetching the item; the next refetch
 * will return 404 if access was revoked.
 *
 * Connection hygiene: a 15s comment heartbeat keeps proxies (Traefik,
 * Amplify rewrites, CloudFront) from closing the idle connection.
 */
app.get('/:id', async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  const id = c.req.param('id');

  // Auth check before opening the stream. Reuses the visibility-aware lookup
  // so private items don't even start a connection for non-owners.
  await getItem(m.workspace_id, user.id, id);

  return streamSSE(c, async (stream) => {
    // Initial event so the client knows the connection is live.
    await stream.writeSSE({ event: 'ready', data: JSON.stringify({ at: Date.now() }) });

    // Pipe item changes from the in-memory pub/sub into the response stream.
    // Fire-and-forget writes — writeSSE returns a promise we don't need to
    // await here; backpressure isn't a concern at this event rate.
    const unsub = subscribeToItem(id, (event) => {
      void stream.writeSSE({ event: 'change', data: JSON.stringify(event) });
    });

    // Heartbeat to prevent proxy-side idle timeouts (Vite/Amplify/Traefik
    // close idle TCP after ~30-60s). A comment line keeps the stream alive
    // without showing up as an event to the client.
    const heartbeat = setInterval(() => {
      void stream.writeSSE({ data: '', event: 'ping' });
    }, 15_000);

    // Hold the callback open until the client disconnects. onAbort fires when
    // the browser closes the EventSource (navigation, tab close, page reload).
    await new Promise<void>((resolve) => {
      stream.onAbort(() => resolve());
    });

    clearInterval(heartbeat);
    unsub();
  });
});

export default app;
