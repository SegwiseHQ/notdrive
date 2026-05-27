import type { MiddlewareHandler } from 'hono';
import { nanoid } from 'nanoid';
import { logger } from '../util/logger.js';
import type { Variables } from '../context.js';

export const requestLog: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const id = c.req.header('x-request-id') ?? nanoid(12);
  c.set('requestId', id);
  c.header('X-Request-Id', id);
  const start = Date.now();
  try {
    await next();
  } finally {
    const ms = Date.now() - start;
    logger.info(
      { reqId: id, method: c.req.method, path: c.req.path, status: c.res.status, ms },
      'request',
    );
  }
};
