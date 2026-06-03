import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Variables } from './context.js';
import { HttpError } from './util/errors.js';
import { logger } from './util/logger.js';
import { corsMiddleware } from './middleware/cors.js';
import { csrf } from './middleware/csrf.js';
import { requestLog } from './middleware/requestLog.js';
import auth from './routes/auth.js';
import me from './routes/me.js';
import workspaces from './routes/workspaces.js';
import items from './routes/items.js';
import itemTags from './routes/itemTags.js';
import tags from './routes/tags.js';
import views from './routes/views.js';
import search from './routes/search.js';
import drive from './routes/drive.js';
import importRoutes from './routes/import.js';
import itemAssets from './routes/itemAssets.js';
import itemStream from './routes/itemStream.js';
import comments from './routes/comments.js';
import commentsById from './routes/commentsById.js';
import notifications from './routes/notifications.js';
import recent from './routes/recent.js';

export function buildApp() {
  const app = new Hono<{ Variables: Variables }>();

  app.use('*', corsMiddleware());
  app.use('*', requestLog);
  app.use('*', csrf);

  app.get('/health', (c) => c.json({ ok: true }));

  const api = app
    .route('/api/auth', auth)
    .route('/me', me)
    .route('/workspaces', workspaces)
    .route('/items', items)
    .route('/items', itemTags)
    .route('/items', comments)
    .route('/comments', commentsById)
    .route('/notifications', notifications)
    .route('/tags', tags)
    .route('/views', views)
    .route('/search', search)
    .route('/drive', drive)
    .route('/import', importRoutes)
    .route('/item-assets', itemAssets)
    .route('/item-stream', itemStream)
    .route('/recent', recent);

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: err.code, message: err.message, details: err.details }, err.status);
    }
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    logger.error({ err: err.message, stack: err.stack }, 'unhandled');
    return c.json({ error: 'internal', message: 'internal error' }, 500);
  });

  return api;
}

export type AppType = ReturnType<typeof buildApp>;
