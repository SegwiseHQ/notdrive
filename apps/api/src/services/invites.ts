import type { Role } from '@notdrive/shared';
import { and, eq, gt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { conflict, forbidden, notFound } from '../util/errors.js';
import { newId, newInviteToken, now } from '../util/ids.js';
import { logger } from '../util/logger.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function createInvite(
  workspaceId: string,
  invitedBy: string,
  email: string,
  role: Role,
) {
  const id = newId();
  const token = newInviteToken();
  const ts = now();
  await db.insert(schema.workspace_invites).values({
    id,
    workspace_id: workspaceId,
    email: email.toLowerCase(),
    role,
    token,
    invited_by: invitedBy,
    expires_at: ts + INVITE_TTL_MS,
    created_at: ts,
  });
  // For local dev, log the invite link; a future email transport replaces this.
  logger.info({ email, workspaceId, token }, 'invite created (log-only in dev)');
  return { id, token, expires_at: ts + INVITE_TTL_MS };
}

export async function acceptInvite(userId: string, userEmail: string, token: string) {
  const ts = now();
  const rows = await db
    .select()
    .from(schema.workspace_invites)
    .where(
      and(eq(schema.workspace_invites.token, token), gt(schema.workspace_invites.expires_at, ts)),
    )
    .limit(1);
  const inv = rows[0];
  if (!inv) throw notFound('invite not found or expired');
  if (inv.accepted_at) throw conflict('invite already used');
  if (inv.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw forbidden('invite is for a different email');
  }
  const already = await db
    .select()
    .from(schema.workspace_members)
    .where(
      and(
        eq(schema.workspace_members.workspace_id, inv.workspace_id),
        eq(schema.workspace_members.user_id, userId),
      ),
    )
    .limit(1);
  if (already.length) throw conflict('already a member');

  await db.transaction(async (tx) => {
    await tx.insert(schema.workspace_members).values({
      workspace_id: inv.workspace_id,
      user_id: userId,
      role: inv.role,
      joined_at: ts,
    });
    await tx
      .update(schema.workspace_invites)
      .set({ accepted_at: ts })
      .where(eq(schema.workspace_invites.id, inv.id));
  });

  // Fire-and-forget: back-fill Drive permissions if the workspace opts in.
  const { getWorkspaceAutoShare, shareAllFilesWithUser } = await import('./autoShare.js');
  void (async () => {
    const cfg = await getWorkspaceAutoShare(inv.workspace_id);
    if (cfg && cfg.mode !== 'off') {
      logger.info(
        { workspaceId: inv.workspace_id, userId, mode: cfg.mode, role: cfg.role },
        'invite accept: back-filling Drive permissions',
      );
      await shareAllFilesWithUser(inv.workspace_id, userId, userEmail, cfg.mode, cfg.role);
    }
  })().catch((err) =>
    logger.warn({ err: (err as Error).message }, 'invite accept back-fill failed'),
  );

  return { workspace_id: inv.workspace_id, role: inv.role as Role };
}
