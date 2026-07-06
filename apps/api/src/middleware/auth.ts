import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Variables } from '../context.js';
import { db, schema } from '../db/index.js';
import { unauthorized } from '../util/errors.js';
import { now } from '../util/ids.js';
import { logger } from '../util/logger.js';

export const SESSION_COOKIE = 'sid';

export const requireAuth: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const sid = getCookie(c, SESSION_COOKIE);
  const reqId = c.get('requestId');
  if (!sid) {
    logger.warn({ reqId, path: c.req.path }, 'auth failed: missing session cookie');
    throw unauthorized('no session');
  }

  const ts = now();
  const row = await db
    .select({
      sid: schema.sessions.id,
      expires_at: schema.sessions.expires_at,
      u_id: schema.users.id,
      u_email: schema.users.email,
      u_name: schema.users.name,
      u_avatar: schema.users.avatar_url,
      u_dark: schema.users.dark_mode,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.user_id))
    .where(eq(schema.sessions.id, sid))
    .limit(1);

  const r = row[0];
  if (!r) {
    logger.warn({ reqId, path: c.req.path }, 'auth failed: session row not found');
    throw unauthorized('session invalid');
  }
  if (r.expires_at < ts) {
    logger.warn(
      { reqId, path: c.req.path, expiredMs: ts - r.expires_at },
      'auth failed: session expired',
    );
    throw unauthorized('session expired');
  }

  // Touch session (non-blocking)
  void db
    .update(schema.sessions)
    .set({ last_seen_at: ts })
    .where(eq(schema.sessions.id, sid))
    .catch(() => {});

  c.set('session', {
    id: r.sid,
    user_id: r.u_id,
    expires_at: r.expires_at,
    last_seen_at: ts,
  });
  c.set('user', {
    id: r.u_id,
    email: r.u_email,
    name: r.u_name,
    avatar_url: r.u_avatar,
    dark_mode: r.u_dark as 'system' | 'light' | 'dark',
  });
  await next();
};
