import { zValidator } from '@hono/zod-validator';
import { commentCreateSchema } from '@notdrive/shared';
import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import {
  createComment,
  deleteComment,
  editComment,
  listForItem,
} from '../services/comments.js';
import type { Variables } from '../context.js';

const app = new Hono<{ Variables: Variables }>();
app.use('*', requireAuth, requireWorkspace('viewer'));

// Mounted at /items so the URL reads naturally:
//   GET  /items/:id/comments
//   POST /items/:id/comments
app.get('/:id/comments', async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  const thread = await listForItem(m.workspace_id, user.id, c.req.param('id'));
  return c.json({ thread });
});

app.post(
  '/:id/comments',
  requireWorkspace('member'),
  zValidator('json', commentCreateSchema),
  async (c) => {
    const m = c.get('membership');
    const user = c.get('user');
    const { body } = c.req.valid('json');
    const result = await createComment(m.workspace_id, user.id, c.req.param('id'), body);
    return c.json(result, 201);
  },
);

export default app;
