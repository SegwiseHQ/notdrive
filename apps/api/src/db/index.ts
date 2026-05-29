import Database from 'better-sqlite3';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { env } from '../env.js';

type PgSslOption = false | { rejectUnauthorized: boolean; ca?: string };

function pgSslOption(): PgSslOption {
  switch (env.DATABASE_SSL) {
    case 'disable':
      return false;
    case 'no-verify':
      return { rejectUnauthorized: false };
    case 'require':
      return env.DATABASE_SSL_CA
        ? { rejectUnauthorized: true, ca: readFileSync(resolve(env.DATABASE_SSL_CA), 'utf8') }
        : { rejectUnauthorized: true };
  }
}

const { Pool } = pg;
import * as sqliteSchema from './schema.sqlite.js';
import * as pgSchema from './schema.postgres.js';

export type Schema = typeof sqliteSchema;

// Runtime picks the concrete schema, but service code is typed against the
// SQLite schema. Both schemas are column-identical (mode:'boolean' aligns
// SQLite booleans with PG booleans), so the cast is sound.
const usePg = env.DB_DRIVER === 'postgres';

let dbInstance: ReturnType<typeof drizzleSqlite<Schema>> | ReturnType<typeof drizzlePg<Schema>>;
let sqliteClient: Database.Database | null = null;
let pgPool: Pool | null = null;

if (usePg) {
  pgPool = new Pool({ connectionString: env.DATABASE_URL, ssl: pgSslOption() });
  dbInstance = drizzlePg(pgPool, { schema: pgSchema as unknown as Schema });
} else {
  const absPath = resolve(process.cwd(), env.DATABASE_URL);
  sqliteClient = new Database(absPath);
  sqliteClient.pragma('journal_mode = WAL');
  sqliteClient.pragma('foreign_keys = ON');
  dbInstance = drizzleSqlite(sqliteClient, { schema: sqliteSchema });
  // Visible at boot so dev and migrate are provably using the same file.
  console.log(`[db] sqlite @ ${absPath}`);
}

export const db = dbInstance as ReturnType<typeof drizzleSqlite<Schema>>;
export const schema = (usePg ? (pgSchema as unknown as Schema) : sqliteSchema) as Schema;
export { sqliteClient, pgPool, usePg };
export const driver = env.DB_DRIVER;
