import 'dotenv/config';
import type { Config } from 'drizzle-kit';

const driver = (process.env.DB_DRIVER ?? 'sqlite') as 'sqlite' | 'postgres';

const common = {
  out: driver === 'sqlite' ? './drizzle/sqlite' : './drizzle/postgres',
  schema: driver === 'sqlite' ? './src/db/schema.sqlite.ts' : './src/db/schema.postgres.ts',
  strict: true,
};

const config: Config =
  driver === 'postgres'
    ? {
        ...common,
        dialect: 'postgresql',
        dbCredentials: {
          url: process.env.DATABASE_URL ?? 'postgres://notdrive:notdrive@localhost:5432/notdrive',
        },
      }
    : {
        ...common,
        dialect: 'sqlite',
        dbCredentials: { url: process.env.DATABASE_URL ?? './notdrive.db' },
      };

export default config;
