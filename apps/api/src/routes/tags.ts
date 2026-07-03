import { zValidator } from '@hono/zod-validator';
import { tagCreateSchema, tagPatchSchema } from '@notdrive/shared';
import { Hono } from 'hono';
import type { Variables } from '../context.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { createTag, deleteTag, listTags, patchTag } from '../services/tags.js';

const app = new Hono<{ Variables: Variables }>();
app.use('*', requireAuth, requireWorkspace('viewer'));

app.get('/', async (c) => c.json(await listTags(c.get('membership').workspace_id)));

app.post('/', requireWorkspace('member'), zValidator('json', tagCreateSchema), async (c) => {
  const m = c.get('membership');
  const body = c.req.valid('json');
  return c.json(await createTag(m.workspace_id, body.name, body.color), 201);
});

app.patch('/:id', requireWorkspace('member'), zValidator('json', tagPatchSchema), async (c) => {
  const m = c.get('membership');
  await patchTag(m.workspace_id, c.req.param('id'), c.req.valid('json'));
  return c.json({ ok: true });
});

app.delete('/:id', requireWorkspace('admin'), async (c) => {
  const m = c.get('membership');
  await deleteTag(m.workspace_id, c.req.param('id'));
  return c.json({ ok: true });
});

export default app;
