import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { importMarkdownZip } from '../services/importer.js';
import { badRequest } from '../util/errors.js';
import type { Variables } from '../context.js';

const app = new Hono<{ Variables: Variables }>();
app.use('*', requireAuth, requireWorkspace('member'));

/**
 * POST /import/zip — multipart form upload of a ZIP containing markdown files.
 * Folder structure becomes the page hierarchy.
 */
app.post('/zip', async (c) => {
  const form = await c.req.parseBody({ all: false });
  const file = form.file;
  if (!(file instanceof File)) {
    throw badRequest('expected multipart field "file" with a ZIP attachment');
  }
  if (file.size > 60 * 1024 * 1024) {
    throw badRequest('ZIP too large (>60 MB)');
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const user = c.get('user');
  const m = c.get('membership');
  const result = await importMarkdownZip(m.workspace_id, user.id, buffer);
  return c.json(result, 201);
});

export default app;
