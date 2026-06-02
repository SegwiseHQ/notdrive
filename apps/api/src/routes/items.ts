import { zValidator } from '@hono/zod-validator';
import {
  itemCreateSchema,
  itemListQuerySchema,
  itemMoveSchema,
  itemPatchSchema,
  linkFileSchema,
} from '@notdrive/shared';
import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { newId } from '../util/ids.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import {
  archiveItem,
  createItem,
  duplicateItem,
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
  const user = c.get('user');
  const q = c.req.valid('query');
  return c.json(await listItems(m.workspace_id, user.id, q));
});

app.get('/:id', async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  return c.json(await getItem(m.workspace_id, user.id, c.req.param('id')));
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
    visibility: body.visibility,
  });
  if (body.drive_file_id) {
    await fetchAndCacheDriveFile(m.workspace_id, user.id, body.drive_file_id).catch(() => {});
  }
  return c.json(await getItem(m.workspace_id, user.id, id), 201);
});

app.patch(
  '/:id',
  requireWorkspace('member'),
  zValidator('json', itemPatchSchema),
  async (c) => {
    const m = c.get('membership');
    const user = c.get('user');
    await patchItem(m.workspace_id, user.id, c.req.param('id'), c.req.valid('json'));
    return c.json(await getItem(m.workspace_id, user.id, c.req.param('id')));
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
    return c.json(await getItem(m.workspace_id, user.id, c.req.param('id')));
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
  return c.json(await getItem(m.workspace_id, user.id, c.req.param('id')));
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
    return c.json(await getItem(m.workspace_id, user.id, c.req.param('id')));
  },
);

app.delete('/:id/link', requireWorkspace('member'), async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  await unlinkDriveFile(m.workspace_id, user.id, c.req.param('id'));
  return c.json(await getItem(m.workspace_id, user.id, c.req.param('id')));
});

// Deep-clone an item + its descendants. Asset bytes are copied; body HTML is
// rewritten so img tags point at the new asset rows. Returns the new root.
app.post('/:id/duplicate', requireWorkspace('member'), async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  const newId = await duplicateItem(m.workspace_id, user.id, c.req.param('id'));
  return c.json(await getItem(m.workspace_id, user.id, newId), 201);
});

// Upload a binary asset (image, etc.) attached to this item. Used by the
// editor's /image command. Returns { id, url } — caller inserts <img src={url}>.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);
app.post('/:id/assets', requireWorkspace('member'), async (c) => {
  const m = c.get('membership');
  const user = c.get('user');
  const id = c.req.param('id');

  // Same visibility-aware lookup pattern as items routes — 404 if the user
  // can't see this item, so they can't upload into someone else's private page.
  const item = await getItem(m.workspace_id, user.id, id);

  const form = await c.req.parseBody({ all: false });
  const file = form.file;
  if (!(file instanceof File)) {
    return c.json({ error: 'bad_request', message: 'expected multipart field "file"' }, 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: 'bad_request', message: `file too large (>${MAX_UPLOAD_BYTES})` }, 400);
  }
  const contentType = file.type || 'application/octet-stream';
  if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
    return c.json({ error: 'bad_request', message: `unsupported content-type: ${contentType}` }, 400);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const assetId = newId();
  await db.insert(schema.item_assets).values({
    id: assetId,
    workspace_id: m.workspace_id,
    item_id: item.id,
    content_type: contentType,
    byte_size: bytes.byteLength,
    data: bytes,
  });

  return c.json({ id: assetId, url: `/item-assets/${assetId}` }, 201);
});

export default app;
