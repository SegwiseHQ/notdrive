import { type drive_v3, google } from 'googleapis';
import { loadServerEnv } from '../env.js';
import { loadGoogleTokens, saveGoogleTokens } from '../services/tokens.js';
import { unauthorized } from '../util/errors.js';
import { logger } from '../util/logger.js';

export async function driveClientFor(userId: string): Promise<drive_v3.Drive> {
  const tokens = await loadGoogleTokens(userId);
  if (!tokens) throw unauthorized('no google tokens for user');

  const env = loadServerEnv();
  const auth = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URI,
  );
  auth.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? undefined,
    expiry_date: tokens.expires_at,
    scope: tokens.scope,
  });

  // Persist new access tokens when googleapis auto-refreshes.
  auth.on('tokens', (t) => {
    if (t.access_token) {
      saveGoogleTokens(userId, t, tokens.scope).catch((e) =>
        logger.warn({ err: (e as Error).message }, 'persist refreshed token failed'),
      );
    }
  });

  return google.drive({ version: 'v3', auth });
}
