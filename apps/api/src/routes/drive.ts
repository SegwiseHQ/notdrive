import {
  driveCreateSchema,
  driveSearchQuerySchema,
  driveTreeQuerySchema,
  linkShareSchema,
  permissionCreateSchema,
  permissionPatchSchema,
} from '@notdrive/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { fetchAndCacheDriveFile, getCachedFile } from '../drive/cache.js';
import { fetchDriveTree } from '../drive/tree.js';
import { syncChanges } from '../drive/changes.js';
import { createDriveFile, isFolderMime } from '../drive/create.js';
import { permanentlyDeleteDriveFile, trashDriveFile, untrashDriveFile } from '../drive/destroy.js';
import { searchDrive } from '../drive/search.js';
import { listTrashedDriveFiles } from '../drive/trash.js';
import {
  addPermission,
  disableLinkSharing,
  enableLinkSharing,
  listPermissions,
  removePermission,
  updatePermission,
} from '../drive/permissions.js';
import { createItem, getItem } from '../services/items.js';
import { notFound } from '../util/errors.js';
import type { Variables } from '../context.js';

const app = new Hono<{ Variables: Variables }>();
app.use('*', requireAuth, requireWorkspace('viewer'));

app.get('/tree', zValidator('query', driveTreeQuerySchema), async (c) => {
  const user = c.get('user');
  const q = c.req.valid('query');
  return c.json(await fetchDriveTree(user.id, { root: q.root, depth: q.depth }));
});

app.get('/search', zValidator('query', driveSearchQuerySchema), async (c) => {
  const user = c.get('user');
  const { q, limit } = c.req.valid('query');
  return c.json(await searchDrive(user.id, q, limit));
});

app.get('/files/:id', async (c) => {
  const user = c.get('user');
  const m = c.get('membership');
  const id = c.req.param('id');
  let cached = await getCachedFile(m.workspace_id, id);
  if (!cached || Date.now() - cached.fetched_at > 10 * 60 * 1000) {
    await fetchAndCacheDriveFile(m.workspace_id, user.id, id);
    cached = await getCachedFile(m.workspace_id, id);
  }
  if (!cached) throw notFound('file not found');
  return c.json(cached);
});

app.post('/sync', async (c) => {
  const user = c.get('user');
  const m = c.get('membership');
  const result = await syncChanges(m.workspace_id, user.id);
  return c.json(result);
});

// Create a new native Google Drive file (Doc, Sheet, Slides, Drawing, Form,
// Script, Site, or Folder). Optionally also create a NotDrive page linked to
// the new file in one round-trip.
app.post('/files', requireWorkspace('member'), zValidator('json', driveCreateSchema), async (c) => {
  const user = c.get('user');
  const m = c.get('membership');
  const input = c.req.valid('json');
  const file = await createDriveFile(user.id, m.workspace_id, input);

  let item = null;
  if (input.create_page && !isFolderMime(file.mime_type)) {
    const id = await createItem({
      workspaceId: m.workspace_id,
      userId: user.id,
      type: 'file',
      title: file.name,
      parentId: null,
      driveFileId: file.drive_file_id,
    });
    item = await getItem(m.workspace_id, user.id, id);
  }

  return c.json({ file, item }, 201);
});

// --- Permissions / sharing -------------------------------------------------

app.get('/files/:id/permissions', async (c) => {
  const user = c.get('user');
  return c.json(await listPermissions(user.id, c.req.param('id')));
});

app.post(
  '/files/:id/permissions',
  requireWorkspace('member'),
  zValidator('json', permissionCreateSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');
    return c.json(await addPermission(user.id, c.req.param('id'), input), 201);
  },
);

app.patch(
  '/files/:id/permissions/:pid',
  requireWorkspace('member'),
  zValidator('json', permissionPatchSchema),
  async (c) => {
    const user = c.get('user');
    const { role } = c.req.valid('json');
    return c.json(
      await updatePermission(user.id, c.req.param('id'), c.req.param('pid'), role),
    );
  },
);

app.delete('/files/:id/permissions/:pid', requireWorkspace('member'), async (c) => {
  const user = c.get('user');
  await removePermission(user.id, c.req.param('id'), c.req.param('pid'));
  return c.json({ ok: true });
});

app.post(
  '/files/:id/share-link',
  requireWorkspace('member'),
  zValidator('json', linkShareSchema),
  async (c) => {
    const user = c.get('user');
    const { role } = c.req.valid('json');
    return c.json(await enableLinkSharing(user.id, c.req.param('id'), role));
  },
);

app.delete('/files/:id/share-link', requireWorkspace('member'), async (c) => {
  const user = c.get('user');
  await disableLinkSharing(user.id, c.req.param('id'));
  return c.json({ ok: true });
});

// Trash or permanently delete a Drive file. ?permanent=1 → files.delete (owner
// only). Default is trash (reversible). Drive's /changes poll auto-archives
// any NotDrive page linked to the trashed file.
app.delete('/files/:id', requireWorkspace('member'), async (c) => {
  const user = c.get('user');
  const fileId = c.req.param('id');
  const permanent = c.req.query('permanent') === '1';
  if (permanent) {
    await permanentlyDeleteDriveFile(user.id, fileId);
  } else {
    await trashDriveFile(user.id, fileId);
  }
  return c.json({ ok: true, permanent });
});

app.post('/files/:id/untrash', requireWorkspace('member'), async (c) => {
  const user = c.get('user');
  await untrashDriveFile(user.id, c.req.param('id'));
  return c.json({ ok: true });
});

app.get('/trash', async (c) => {
  const user = c.get('user');
  return c.json(await listTrashedDriveFiles(user.id));
});

export default app;
