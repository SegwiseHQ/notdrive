import { existsSync } from 'node:fs';
import * as dotenv from 'dotenv';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Never touch a developer's env files, even if the production guard regresses.
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => true) }));
vi.mock('dotenv', () => ({ config: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('DB_DRIVER', 'postgres');
  vi.stubEnv('DATABASE_URL', 'postgres://test:test@database:5432/notdrive');
  vi.stubEnv('GOOGLE_CLIENT_ID', 'runtime-client-id');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'runtime-client-secret');
  vi.stubEnv('GOOGLE_OAUTH_REDIRECT_URI', 'https://api.example.com/api/auth/google/callback');
  vi.stubEnv('APP_ENCRYPTION_KEY', Buffer.alloc(32, 1).toString('base64'));
  vi.stubEnv('SESSION_SECRET', Buffer.alloc(32, 2).toString('base64'));
  vi.stubEnv('API_ORIGIN', 'https://api.example.com');
  vi.stubEnv('WEB_ORIGIN', 'https://app.example.com');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('runtime configuration', () => {
  it('uses the injected environment for migrations and the production API without reading files', async () => {
    const { env, loadServerEnv } = await import('../src/env.js');

    expect(env).toMatchObject({
      NODE_ENV: 'production',
      DB_DRIVER: 'postgres',
      DATABASE_URL: 'postgres://test:test@database:5432/notdrive',
    });
    expect(loadServerEnv()).toMatchObject({
      ...env,
      GOOGLE_CLIENT_ID: 'runtime-client-id',
      GOOGLE_CLIENT_SECRET: 'runtime-client-secret',
      API_ORIGIN: 'https://api.example.com',
      WEB_ORIGIN: 'https://app.example.com',
    });
    expect(existsSync).not.toHaveBeenCalled();
    expect(dotenv.config).not.toHaveBeenCalled();
  });

  it('rejects missing runtime credentials instead of falling back to an env file', async () => {
    vi.stubEnv('GOOGLE_CLIENT_SECRET', undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { loadServerEnv } = await import('../src/env.js');

    expect(() => loadServerEnv()).toThrow('invalid environment');
    expect(dotenv.config).not.toHaveBeenCalled();
  });

  it('keeps dotenv loading for local development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    await import('../src/env.js');

    expect(dotenv.config).toHaveBeenCalledOnce();
  });

  it('does not read local env files during tests', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    await import('../src/env.js');

    expect(existsSync).not.toHaveBeenCalled();
    expect(dotenv.config).not.toHaveBeenCalled();
  });
});
