import { lt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { now } from '../util/ids.js';
import { logger } from '../util/logger.js';

export async function inviteGcTick() {
  const ts = now();
  const rows = await db
    .select({ id: schema.workspace_invites.id })
    .from(schema.workspace_invites)
    .where(lt(schema.workspace_invites.expires_at, ts));
  if (rows.length === 0) return { deleted: 0 };
  await db.delete(schema.workspace_invites).where(lt(schema.workspace_invites.expires_at, ts));
  logger.info({ count: rows.length }, 'invite-gc deleted expired invites');
  return { deleted: rows.length };
}
