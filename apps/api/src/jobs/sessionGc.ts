import { lt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { now } from '../util/ids.js';
import { logger } from '../util/logger.js';

export async function sessionGcTick() {
  const ts = now();
  const rows = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(lt(schema.sessions.expires_at, ts));
  for (const _r of rows) {
    await db.delete(schema.sessions).where(lt(schema.sessions.expires_at, ts));
    break;
  }
  if (rows.length) logger.info({ count: rows.length }, 'session-gc deleted expired sessions');
  return { deleted: rows.length };
}
