import { Hono } from 'hono';
import type { Variables } from '../context.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { listRecent } from '../services/recent.js';

const app = new Hono<{ Variables: Variables }>();
app.use('*', requireAuth, requireWorkspace('viewer'));

app.get('/', async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  return c.json(await listRecent(m.workspace_id, user.id));
});

export default app;
