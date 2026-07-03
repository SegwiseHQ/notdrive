import { zValidator } from '@hono/zod-validator';
import { mePatchSchema } from '@notdrive/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Variables } from '../context.js';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { listWorkspaces } from '../services/workspaces.js';

const app = new Hono<{ Variables: Variables }>();

app.use('*', requireAuth);

app.get('/', async (c) => {
  const user = c.get('user');
  const workspaces = await listWorkspaces(user.id);
  const wsHeader = c.req.header('x-workspace-id');
  const current = wsHeader
    ? (workspaces.find((w) => w.id === wsHeader) ?? null)
    : (workspaces[0] ?? null);
  return c.json({ user, workspaces, current_workspace: current });
});

app.patch('/', zValidator('json', mePatchSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  if (body.dark_mode) {
    await db
      .update(schema.users)
      .set({ dark_mode: body.dark_mode })
      .where(eq(schema.users.id, user.id));
  }
  return c.json({ ok: true });
});

export default app;
