import { zValidator } from '@hono/zod-validator';
import {
  inviteAcceptSchema,
  inviteCreateSchema,
  memberPatchSchema,
  workspaceCreateSchema,
  workspacePatchSchema,
} from '@notdrive/shared';
import { Hono } from 'hono';
import type { Variables } from '../context.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { acceptInvite, createInvite } from '../services/invites.js';
import {
  createWorkspace,
  listMembers,
  listWorkspaces,
  removeMember,
  updateMemberRole,
  updateWorkspace,
} from '../services/workspaces.js';

const app = new Hono<{ Variables: Variables }>();
app.use('*', requireAuth);

app.get('/', async (c) => c.json(await listWorkspaces(c.get('user').id)));

app.post('/', zValidator('json', workspaceCreateSchema), async (c) => {
  const user = c.get('user');
  const { name } = c.req.valid('json');
  return c.json(await createWorkspace(user.id, name));
});

// Accept an invite (current user, via token they received).
app.post('/invites/accept', zValidator('json', inviteAcceptSchema), async (c) => {
  const user = c.get('user');
  const { token } = c.req.valid('json');
  return c.json(await acceptInvite(user.id, user.email, token));
});

const scoped = new Hono<{ Variables: Variables }>();
scoped.use('*', requireAuth);

scoped.get('/:wsId/members', requireWorkspace('member'), async (c) => {
  return c.json(await listMembers(c.get('membership').workspace_id));
});

scoped.patch(
  '/:wsId',
  requireWorkspace('admin'),
  zValidator('json', workspacePatchSchema),
  async (c) => {
    const m = c.get('membership');
    await updateWorkspace(m.workspace_id, c.req.valid('json'));
    return c.json({ ok: true });
  },
);

scoped.post(
  '/:wsId/invites',
  requireWorkspace('admin'),
  zValidator('json', inviteCreateSchema),
  async (c) => {
    const m = c.get('membership');
    const user = c.get('user');
    const body = c.req.valid('json');
    return c.json(await createInvite(m.workspace_id, user.id, body.email, body.role));
  },
);

scoped.patch(
  '/:wsId/members/:uid',
  requireWorkspace('admin'),
  zValidator('json', memberPatchSchema),
  async (c) => {
    const m = c.get('membership');
    const actor = c.get('user');
    const targetUid = c.req.param('uid');
    const { role } = c.req.valid('json');
    await updateMemberRole(m.workspace_id, actor.id, m.role, targetUid, role);
    return c.json({ ok: true });
  },
);

scoped.delete('/:wsId/members/:uid', requireWorkspace('owner'), async (c) => {
  const m = c.get('membership');
  const actor = c.get('user');
  const targetUid = c.req.param('uid');
  await removeMember(m.workspace_id, actor.id, targetUid);
  return c.json({ ok: true });
});

app.route('/', scoped);

export default app;
