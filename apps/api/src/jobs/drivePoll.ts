import { gt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { syncChanges } from '../drive/changes.js';
import { now } from '../util/ids.js';
import { logger } from '../util/logger.js';

const ACTIVE_WINDOW_MS = 2 * 60 * 1000;

/**
 * Poll Drive /changes for each workspace+user pair that had a live session in
 * the last 2 minutes. Swallows per-user errors so a single broken token
 * doesn't block the others.
 */
export async function drivePollTick() {
  const activeUsers = await db
    .select({ user_id: schema.sessions.user_id })
    .from(schema.sessions)
    .where(gt(schema.sessions.last_seen_at, now() - ACTIVE_WINDOW_MS))
    .groupBy(schema.sessions.user_id);

  if (activeUsers.length === 0) return { pairs: 0 };

  const rows = await db
    .select({
      workspace_id: schema.workspace_members.workspace_id,
      user_id: schema.workspace_members.user_id,
    })
    .from(schema.workspace_members);

  let count = 0;
  for (const r of rows) {
    if (!activeUsers.some((u) => u.user_id === r.user_id)) continue;
    try {
      const { processed } = await syncChanges(r.workspace_id, r.user_id);
      if (processed > 0) {
        logger.info({ ws: r.workspace_id, user: r.user_id, processed }, 'drive changes synced');
      }
      count++;
    } catch (err) {
      logger.warn(
        { err: (err as Error).message, ws: r.workspace_id, user: r.user_id },
        'drive-poll failed',
      );
    }
  }
  return { pairs: count };
}
