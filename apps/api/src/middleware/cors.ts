import { cors } from 'hono/cors';
import { loadServerEnv } from '../env.js';
import { logger } from '../util/logger.js';

/**
 * WEB_ORIGIN can be a single origin or a comma-separated list, so a single
 * deploy can authorize both the prod web and any preview/staging hostnames.
 */
export function corsMiddleware() {
  const env = loadServerEnv();
  const allowed = env.WEB_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  logger.info({ allowed }, 'CORS allow-list loaded');

  return cors({
    origin: (origin) => {
      if (!origin) return allowed[0] ?? '';
      if (allowed.includes(origin)) return origin;
      logger.warn({ origin, allowed }, 'CORS rejected — origin not in WEB_ORIGIN list');
      return allowed[0] ?? '';
    },
    credentials: true,
    allowHeaders: ['Content-Type', 'X-Workspace-Id', 'X-Requested-With'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['X-Request-Id'],
    maxAge: 86400,
  });
}
