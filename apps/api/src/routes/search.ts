import { zValidator } from '@hono/zod-validator';
import { searchQuerySchema } from '@notdrive/shared';
import { Hono } from 'hono';
import type { Variables } from '../context.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { search } from '../services/search.js';

const app = new Hono<{ Variables: Variables }>();
app.use('*', requireAuth, requireWorkspace('viewer'));

app.get('/', zValidator('query', searchQuerySchema), async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  const { q, limit } = c.req.valid('query');
  return c.json(await search(m.workspace_id, user.id, q, limit));
});

export default app;
