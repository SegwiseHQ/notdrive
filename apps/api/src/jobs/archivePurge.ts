import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { now } from '../util/ids.js';
import { logger } from '../util/logger.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function archivePurgeTick() {
  const threshold = now() - THIRTY_DAYS_MS;
  const stale = await db
    .select({ id: schema.items.id })
    .from(schema.items)
    .where(
      and(
        eq(schema.items.is_archived, true),
        isNotNull(schema.items.archived_at),
        lt(schema.items.archived_at, threshold),
      ),
    );
  for (const r of stale) {
    await db.delete(schema.items).where(eq(schema.items.id, r.id));
  }
  if (stale.length) logger.info({ count: stale.length }, 'archive-purge deleted stale items');
  return { deleted: stale.length };
}
