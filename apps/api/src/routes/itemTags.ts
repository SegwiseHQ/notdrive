import { Hono } from 'hono';
import type { Variables } from '../context.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { attachTag, detachTag } from '../services/tags.js';

const app = new Hono<{ Variables: Variables }>();
app.use('*', requireAuth, requireWorkspace('member'));

app.post('/:itemId/tags/:tagId', async (c) => {
  const m = c.get('membership');
  await attachTag(m.workspace_id, c.req.param('itemId'), c.req.param('tagId'));
  return c.json({ ok: true });
});

app.delete('/:itemId/tags/:tagId', async (c) => {
  const m = c.get('membership');
  await detachTag(m.workspace_id, c.req.param('itemId'), c.req.param('tagId'));
  return c.json({ ok: true });
});

export default app;
