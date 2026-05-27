import { zValidator } from '@hono/zod-validator';
import {
  itemCreateSchema,
  itemListQuerySchema,
  itemMoveSchema,
  itemPatchSchema,
  linkFileSchema,
} from '@notdrive/shared';
import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import {
  archiveItem,
  createItem,
  getItem,
  linkDriveFile,
  listItems,
  moveItem,
  patchItem,
  purgeItem,
  recordOpen,
  restoreBodyFromAppData,
  restoreItem,
  unlinkDriveFile,
} from '../services/items.js';
import { fetchAndCacheDriveFile } from '../drive/cache.js';
import type { Variables } from '../context.js';

const app = new Hono<{ Variables: Variables }>();
app.use('*', requireAuth, requireWorkspace('viewer'));

app.get('/', zValidator('query', itemListQuerySchema), async (c) => {
  const m = c.get('membership');
  const q = c.req.valid('query');
  return c.json(await listItems(m.workspace_id, q));
});

app.get('/:id', async (c) => {
  const m = c.get('membership');
  return c.json(await getItem(m.workspace_id, c.req.param('id')));
});

app.post('/', requireWorkspace('member'), zValidator('json', itemCreateSchema), async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  const body = c.req.valid('json');
  const id = await createItem({
    workspaceId: m.workspace_id,
    userId: user.id,
    type: body.type,
    title: body.title,
    parentId: body.parent_id ?? null,
    driveFileId: body.drive_file_id ?? null,
  });
  if (body.drive_file_id) {
    await fetchAndCacheDriveFile(m.workspace_id, user.id, body.drive_file_id).catch(() => {});
  }
  return c.json(await getItem(m.workspace_id, id), 201);
});

app.patch(
  '/:id',
  requireWorkspace('member'),
  zValidator('json', itemPatchSchema),
  async (c) => {
    const m = c.get('membership');
    const user = c.get('user');
    await patchItem(m.workspace_id, user.id, c.req.param('id'), c.req.valid('json'));
    return c.json(await getItem(m.workspace_id, c.req.param('id')));
  },
);

app.patch(
  '/:id/move',
  requireWorkspace('member'),
  zValidator('json', itemMoveSchema),
  async (c) => {
    const m = c.get('membership');
    const user = c.get('user');
    await moveItem(m.workspace_id, user.id, c.req.param('id'), c.req.valid('json'));
    return c.json(await getItem(m.workspace_id, c.req.param('id')));
  },
);

app.post('/:id/open', async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  await recordOpen(m.workspace_id, user.id, c.req.param('id'));
  return c.json({ ok: true });
});

app.delete('/:id', requireWorkspace('member'), async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  const hard = c.req.query('hard') === '1';
  if (hard) {
    await purgeItem(m.workspace_id, user.id, c.req.param('id'));
  } else {
    await archiveItem(m.workspace_id, user.id, c.req.param('id'));
  }
  return c.json({ ok: true });
});

app.post('/:id/restore-body', requireWorkspace('member'), async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  const body = await restoreBodyFromAppData(m.workspace_id, user.id, c.req.param('id'));
  return c.json({ ok: true, body });
});

app.post('/:id/restore', requireWorkspace('member'), async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  await restoreItem(m.workspace_id, user.id, c.req.param('id'));
  return c.json(await getItem(m.workspace_id, c.req.param('id')));
});

app.post(
  '/:id/link',
  requireWorkspace('member'),
  zValidator('json', linkFileSchema),
  async (c) => {
    const m = c.get('membership');
    const user = c.get('user');
    const { drive_file_id } = c.req.valid('json');
    await linkDriveFile(m.workspace_id, user.id, c.req.param('id'), drive_file_id);
    await fetchAndCacheDriveFile(m.workspace_id, user.id, drive_file_id).catch(() => {});
    return c.json(await getItem(m.workspace_id, c.req.param('id')));
  },
);

app.delete('/:id/link', requireWorkspace('member'), async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  await unlinkDriveFile(m.workspace_id, user.id, c.req.param('id'));
  return c.json(await getItem(m.workspace_id, c.req.param('id')));
});

export default app;
