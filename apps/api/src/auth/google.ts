import { google } from 'googleapis';
import { loadServerEnv } from '../env.js';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive',
  // Explicit appData scope. Full `drive` alone does NOT grant appDataFolder
  // access despite seemingly broader — Google treats appdata as its own scope.
  'https://www.googleapis.com/auth/drive.appdata',
];

export function oauthClient() {
  const env = loadServerEnv();
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

export function buildAuthUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeCode(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error('no access_token from google');
  if (!tokens.id_token) throw new Error('no id_token from google');
  return tokens;
}

export async function getProfile(idToken: string) {
  // Decode id_token without verifying signature beyond what Google returned over TLS.
  // For production-grade verification, use google-auth-library's OAuth2Client.verifyIdToken.
  const client = oauthClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: loadServerEnv().GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload) throw new Error('invalid id_token');
  return {
    sub: payload.sub,
    email: payload.email ?? '',
    name: payload.name ?? payload.email ?? 'User',
    picture: payload.picture ?? null,
  };
}
