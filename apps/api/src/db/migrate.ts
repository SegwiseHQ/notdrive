import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { env } from '../env.js';
import { db, usePg, pgPool, sqliteClient } from './index.js';
import { applySqliteSearch } from '../search/sqlite.js';

async function main() {
  if (usePg) {
    await migratePg(db as never, { migrationsFolder: './drizzle/postgres' });
    console.log('[migrate] postgres migrations applied');
    // Postgres FTS setup (idempotent)
    const pool = pgPool;
    if (pool) {
      const { applyPostgresSearch } = await import('../search/postgres.js');
      await applyPostgresSearch(pool);
      console.log('[migrate] postgres search objects applied');
    }
    await pgPool?.end();
  } else {
    migrateSqlite(db as never, { migrationsFolder: './drizzle/sqlite' });
    console.log('[migrate] sqlite migrations applied');
    if (sqliteClient) {
      applySqliteSearch(sqliteClient);
      console.log('[migrate] sqlite FTS5 applied');
    }
    sqliteClient?.close();
  }
  console.log(`[migrate] done (driver=${env.DB_DRIVER})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
