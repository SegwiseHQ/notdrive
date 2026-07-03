import { zValidator } from '@hono/zod-validator';
import { notificationsMarkReadSchema } from '@notdrive/shared';
import { Hono } from 'hono';
import type { Variables } from '../context.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { listForUser, markAllRead, markRead } from '../services/notifications.js';

const app = new Hono<{ Variables: Variables }>();
app.use('*', requireAuth, requireWorkspace('viewer'));

app.get('/', async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  return c.json(await listForUser(m.workspace_id, user.id));
});

app.post('/mark-read', zValidator('json', notificationsMarkReadSchema), async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  await markRead(m.workspace_id, user.id, c.req.valid('json').ids);
  return c.json({ ok: true });
});

app.post('/mark-all-read', async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  await markAllRead(m.workspace_id, user.id);
  return c.json({ ok: true });
});

export default app;
