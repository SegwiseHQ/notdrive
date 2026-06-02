import { zValidator } from '@hono/zod-validator';
import { commentPatchSchema } from '@notdrive/shared';
import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { deleteComment, editComment } from '../services/comments.js';
import type { Variables } from '../context.js';

// Mutations addressed by comment id. Split out so the items router can stay
// focused on `/items/:id/comments` (list + create), while edits and deletes
// hit `/comments/:id`.
const app = new Hono<{ Variables: Variables }>();
app.use('*', requireAuth, requireWorkspace('member'));

app.patch('/:id', zValidator('json', commentPatchSchema), async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  await editComment(m.workspace_id, user.id, c.req.param('id'), c.req.valid('json').body);
  return c.json({ ok: true });
});

app.delete('/:id', async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  await deleteComment(m.workspace_id, user.id, m.role, c.req.param('id'));
  return c.json({ ok: true });
});

export default app;
