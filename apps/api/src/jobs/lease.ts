import { and, eq, lt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { now } from '../util/ids.js';

/**
 * Try to acquire a named lease for `ttlMs`. Returns true if acquired (and this
 * process is the current leader for that job). Expired leases are stolen.
 * Single-node safe under SQLite via UNIQUE conflict; safe under Postgres via
 * the same upsert semantics.
 */
export async function tryAcquire(name: string, holder: string, ttlMs: number): Promise<boolean> {
  const ts = now();
  const expires = ts + ttlMs;

  const existing = await db
    .select()
    .from(schema.job_leases)
    .where(eq(schema.job_leases.name, name))
    .limit(1);

  if (!existing[0]) {
    try {
      await db.insert(schema.job_leases).values({ name, holder, expires_at: expires });
      return true;
    } catch {
      return false;
    }
  }
  if (existing[0].holder === holder || existing[0].expires_at < ts) {
    const res = await db
      .update(schema.job_leases)
      .set({ holder, expires_at: expires })
      .where(and(eq(schema.job_leases.name, name), lt(schema.job_leases.expires_at, ts + 1)));
    if (res) return true;
  }
  return false;
}

export async function release(name: string, holder: string) {
  await db
    .delete(schema.job_leases)
    .where(and(eq(schema.job_leases.name, name), eq(schema.job_leases.holder, holder)));
}
