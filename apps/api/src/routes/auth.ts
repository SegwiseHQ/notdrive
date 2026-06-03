import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { env, loadServerEnv } from '../env.js';
import { db, schema } from '../db/index.js';
import { buildAuthUrl, exchangeCode, getProfile } from '../auth/google.js';
import { newId, newSessionId, now } from '../util/ids.js';
import { saveGoogleTokens } from '../services/tokens.js';
import { createPersonalWorkspace } from '../services/workspaces.js';
import { badRequest } from '../util/errors.js';
import { SESSION_COOKIE } from '../middleware/auth.js';
import type { Variables } from '../context.js';
import { logger } from '../util/logger.js';

const app = new Hono<{ Variables: Variables }>();

const STATE_COOKIE = 'oauth_state';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Use the configured API_ORIGIN to decide whether to mark cookies Secure.
// Tunnels in dev (https://...trycloudflare.com) need Secure + SameSite=None so
// the cookie survives the third-party Google → us redirect on all browsers.
function isHttpsOrigin() {
  try {
    return new URL(loadServerEnv().API_ORIGIN).protocol === 'https:';
  } catch {
    return false;
  }
}

// WEB_ORIGIN supports a comma-separated allowlist (consumed by the CORS
// middleware). Redirects need a single canonical destination — first entry
// in the list wins, falling back to the whole string for safety.
function primaryWebOrigin(): string {
  const raw = loadServerEnv().WEB_ORIGIN;
  const first = raw.split(',')[0]?.trim();
  return first && first.length > 0 ? first : raw;
}

app.get('/google/start', (c) => {
  const state = newId();
  const https = isHttpsOrigin();
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: https ? 'None' : 'Lax',
    secure: https,
    path: '/',
    maxAge: 600,
  });
  logger.debug({ state, https }, 'oauth start: state cookie set');
  return c.redirect(buildAuthUrl(state));
});

app.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const stateCookie = getCookie(c, STATE_COOKIE);

  if (!code) {
    logger.warn('oauth callback: no code in query');
    throw badRequest('invalid oauth state (no code)');
  }
  if (!state) {
    logger.warn('oauth callback: no state in query');
    throw badRequest('invalid oauth state (no state in url)');
  }
  if (!stateCookie) {
    logger.warn(
      { state },
      'oauth callback: oauth_state cookie missing — origin mismatch, or cookie blocked',
    );
    throw badRequest('invalid oauth state (cookie missing — likely origin mismatch)');
  }
  if (state !== stateCookie) {
    logger.warn({ state, stateCookie }, 'oauth callback: state mismatch — double sign-in?');
    throw badRequest('invalid oauth state (mismatch — did you start two sign-ins?)');
  }
  deleteCookie(c, STATE_COOKIE);

  const tokens = await exchangeCode(code);
  const profile = await getProfile(tokens.id_token!);

  // Email-domain allowlist. Empty env = no restriction.
  const allowed = loadServerEnv().ALLOWED_EMAIL_DOMAINS;
  if (allowed.length > 0) {
    const domain = (profile.email.split('@')[1] ?? '').toLowerCase();
    if (!allowed.includes(domain)) {
      logger.warn({ email: profile.email, domain, allowed }, 'login rejected: domain not allowed');
      const dest = new URL('/login', primaryWebOrigin());
      dest.searchParams.set('error', 'domain_not_allowed');
      dest.searchParams.set('domain', domain);
      return c.redirect(dest.toString());
    }
  }

  const ts = now();
  let userId: string;
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.google_id, profile.sub))
    .limit(1);

  if (existing[0]) {
    userId = existing[0].id;
    await db
      .update(schema.users)
      .set({ email: profile.email, name: profile.name, avatar_url: profile.picture })
      .where(eq(schema.users.id, userId));
  } else {
    userId = newId();
    await db.insert(schema.users).values({
      id: userId,
      google_id: profile.sub,
      email: profile.email,
      name: profile.name,
      avatar_url: profile.picture,
      dark_mode: 'system',
      created_at: ts,
    });
    await createPersonalWorkspace(userId, profile.name);
  }

  await saveGoogleTokens(userId, tokens, tokens.scope ?? '');

  const sid = newSessionId();
  await db.insert(schema.sessions).values({
    id: sid,
    user_id: userId,
    user_agent: c.req.header('user-agent') ?? null,
    expires_at: ts + SESSION_TTL_MS,
    last_seen_at: ts,
    created_at: ts,
  });

  const https = isHttpsOrigin();
  setCookie(c, SESSION_COOKIE, sid, {
    httpOnly: true,
    // Cross-site fetch from the web tunnel/origin needs SameSite=None+Secure;
    // same-origin deployments (web+api on one host) keep the stricter Lax.
    sameSite: https ? 'None' : 'Lax',
    secure: https,
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });

  logger.info({ userId, https }, 'login ok');
  return c.redirect(primaryWebOrigin());
});

app.post('/logout', async (c) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sid));
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

export default app;
