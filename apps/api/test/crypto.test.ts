import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.SESSION_SECRET = randomBytes(32).toString('base64');
  process.env.GOOGLE_CLIENT_ID = 'x';
  process.env.GOOGLE_CLIENT_SECRET = 'x';
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';
  process.env.API_ORIGIN = 'http://localhost:3000';
  process.env.WEB_ORIGIN = 'http://localhost:5173';
});

describe('secretbox', () => {
  it('seal/open roundtrips', async () => {
    const { seal, open } = await import('../src/crypto/secretbox.js');
    const pt = 'hello, drive tokens!';
    const sealed = seal(pt);
    expect(sealed.ct).not.toContain(pt);
    expect(open(sealed)).toBe(pt);
  });

  it('tampering is detected', async () => {
    const { seal, open } = await import('../src/crypto/secretbox.js');
    const sealed = seal('secret');
    const flipped = { ...sealed, ct: `${sealed.ct.slice(0, -4)}AAAA` };
    expect(() => open(flipped)).toThrow();
  });
});
