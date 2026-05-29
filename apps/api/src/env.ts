import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import { z } from 'zod';

// Walk up from this file looking for a .env so running from any cwd works.
function loadDotenv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(here, '../../.env'),
    resolve(here, '../../../.env'),
    resolve(here, '../../../../.env'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      dotenv.config({ path: p });
      return;
    }
  }
  dotenv.config();
}
loadDotenv();

// Minimal env — everything that infrastructure (migrations, db driver switch, logger) needs.
const minimalSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('debug'),
  DB_DRIVER: z.enum(['sqlite', 'postgres']).default('sqlite'),
  DATABASE_URL: z.string().min(1).default('./notdrive.db'),
  // Postgres-only. Default `disable` keeps local docker setups unchanged.
  // `require` verifies the server cert against system CAs (or DATABASE_SSL_CA when set — use this for RDS).
  // `no-verify` enables SSL but skips cert validation (ad-hoc testing only).
  DATABASE_SSL: z.enum(['disable', 'require', 'no-verify']).default('disable'),
  // Optional path to a CA cert file (e.g. AWS RDS global-bundle.pem). Used when DATABASE_SSL=require.
  DATABASE_SSL_CA: z.string().optional(),
});

// Server env — everything the running API needs on top of minimal.
const serverSchema = minimalSchema.extend({
  PORT: z.coerce.number().default(3000),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url(),

  APP_ENCRYPTION_KEY: z.string().min(32, 'must be base64 32-byte key'),
  SESSION_SECRET: z.string().min(32, 'must be base64 32-byte key'),

  API_ORIGIN: z.string().url(),
  // One origin or a comma-separated list of allowed web origins for CORS.
  // Each entry must be a fully-qualified URL with no trailing slash.
  WEB_ORIGIN: z
    .string()
    .min(1)
    .refine(
      (s) =>
        s
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
          .every((p) => /^https?:\/\/[^\s/]+$/.test(p)),
      'must be a comma-separated list of origins (e.g. https://app.example.com)',
    ),

  DRIVE_TREE_DEPTH: z.coerce.number().int().min(1).max(6).default(4),

  // Comma-separated list of email domains allowed to sign in (e.g. "segwise.ai,contractor.com").
  // Empty or unset = no restriction.
  ALLOWED_EMAIL_DOMAINS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
    ),
});

function reportAndThrow(issues: z.ZodIssue[]): never {
  console.error('Invalid environment:');
  for (const issue of issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  throw new Error('invalid environment');
}

export const env = (() => {
  const result = minimalSchema.safeParse(process.env);
  if (!result.success) reportAndThrow(result.error.issues);
  return result.data;
})();

let serverEnvCache: z.infer<typeof serverSchema> | null = null;

/** Called from the API bootstrap (index.ts). Throws with a clear list if anything is missing. */
export function loadServerEnv(): z.infer<typeof serverSchema> {
  if (serverEnvCache) return serverEnvCache;
  const result = serverSchema.safeParse(process.env);
  if (!result.success) reportAndThrow(result.error.issues);
  serverEnvCache = result.data;
  return serverEnvCache;
}

export type Env = typeof env;
