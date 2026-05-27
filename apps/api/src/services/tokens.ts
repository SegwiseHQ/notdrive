import type { Credentials } from 'google-auth-library';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { open, seal } from '../crypto/secretbox.js';
import { now } from '../util/ids.js';

export async function saveGoogleTokens(userId: string, t: Credentials, scope: string) {
  if (!t.access_token) throw new Error('missing access_token');
  const at = seal(t.access_token);
  const rt = t.refresh_token ? seal(t.refresh_token) : null;
  const expires_at = t.expiry_date ?? now() + 3300_000;

  await db
    .insert(schema.oauth_accounts)
    .values({
      user_id: userId,
      provider: 'google',
      access_token_ct: at.ct,
      access_token_iv: at.iv,
      refresh_token_ct: rt?.ct ?? null,
      refresh_token_iv: rt?.iv ?? null,
      expires_at,
      scope,
      updated_at: now(),
    })
    .onConflictDoUpdate({
      target: [schema.oauth_accounts.user_id, schema.oauth_accounts.provider],
      set: {
        access_token_ct: at.ct,
        access_token_iv: at.iv,
        // Only overwrite refresh token if Google gave us a new one.
        ...(rt ? { refresh_token_ct: rt.ct, refresh_token_iv: rt.iv } : {}),
        expires_at,
        scope,
        updated_at: now(),
      },
    });
}

export async function loadGoogleTokens(userId: string) {
  const row = await db
    .select()
    .from(schema.oauth_accounts)
    .where(and(eq(schema.oauth_accounts.user_id, userId), eq(schema.oauth_accounts.provider, 'google')))
    .limit(1);
  const r = row[0];
  if (!r) return null;
  return {
    access_token: open({ ct: r.access_token_ct, iv: r.access_token_iv }),
    refresh_token:
      r.refresh_token_ct && r.refresh_token_iv
        ? open({ ct: r.refresh_token_ct, iv: r.refresh_token_iv })
        : null,
    expires_at: r.expires_at,
    scope: r.scope,
  };
}

export async function updateAccessToken(userId: string, accessToken: string, expiresAt: number) {
  const at = seal(accessToken);
  await db
    .update(schema.oauth_accounts)
    .set({ access_token_ct: at.ct, access_token_iv: at.iv, expires_at: expiresAt, updated_at: now() })
    .where(
      and(eq(schema.oauth_accounts.user_id, userId), eq(schema.oauth_accounts.provider, 'google')),
    );
}
