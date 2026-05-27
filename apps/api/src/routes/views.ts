import { zValidator } from '@hono/zod-validator';
import { viewCreateSchema, viewPatchSchema } from '@notdrive/shared';
import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { createView, deleteView, listViews, patchView } from '../services/views.js';
import type { Variables } from '../context.js';

const app = new Hono<{ Variables: Variables }>();
app.use('*', requireAuth, requireWorkspace('viewer'));

app.get('/', async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  return c.json(await listViews(m.workspace_id, user.id));
});

app.post('/', zValidator('json', viewCreateSchema), async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  return c.json(await createView(m.workspace_id, user.id, c.req.valid('json')), 201);
});

app.patch('/:id', zValidator('json', viewPatchSchema), async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  await patchView(m.workspace_id, user.id, c.req.param('id'), c.req.valid('json'));
  return c.json({ ok: true });
});

app.delete('/:id', async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  await deleteView(m.workspace_id, user.id, c.req.param('id'));
  return c.json({ ok: true });
});

export default app;
