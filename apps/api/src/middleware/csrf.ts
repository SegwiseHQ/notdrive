import type { MiddlewareHandler } from 'hono';
import { loadServerEnv } from '../env.js';
import { forbidden } from '../util/errors.js';

const UNSAFE = new Set(['POST', 'PATCH', 'DELETE', 'PUT']);

/**
 * Minimal CSRF protection: mutating requests must carry either
 *   X-Workspace-Id (which our own client always sends) or X-Requested-With.
 * Combined with SameSite=Lax cookies this blocks CSRF from third-party sites.
 * Auth callback is GET; login start is GET -> no CSRF needed.
 */
export const csrf: MiddlewareHandler = async (c, next) => {
  if (!UNSAFE.has(c.req.method)) return next();

  // Same-origin requests skip the check (origin === API_ORIGIN).
  const origin = c.req.header('origin') ?? c.req.header('referer') ?? '';
  if (origin.startsWith(loadServerEnv().API_ORIGIN)) return next();

  if (c.req.header('x-workspace-id') || c.req.header('x-requested-with')) {
    return next();
  }
  // Allow auth routes that don't carry these headers (they're GET anyway).
  if (c.req.path.startsWith('/api/auth/') || c.req.path.startsWith('/auth/')) return next();

  throw forbidden('csrf check failed');
};
