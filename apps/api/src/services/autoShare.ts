import { and, eq, isNotNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { type DriveRole, addPermission, listPermissions } from '../drive/permissions.js';
import { logger } from '../util/logger.js';

/**
 * Workspace-wide Drive auto-share.
 *
 * Mode determines policy:
 *   - 'off'    — never auto-share.
 *   - 'domain' — only mirror files whose existing Drive permissions already
 *                include a domain-wide or anyone-with-link entry. This keeps
 *                NotDrive from widening a file's trust beyond what its owner
 *                already chose; narrowly-shared files are skipped.
 *   - 'all'    — mirror every linked file with every member (broadest).
 */

export type AutoShareMode = 'off' | 'domain' | 'all';

export async function getWorkspaceAutoShare(workspaceId: string): Promise<{
  mode: AutoShareMode;
  role: DriveRole;
} | null> {
  const rows = await db
    .select({
      mode: schema.workspaces.auto_share_mode,
      role: schema.workspaces.auto_share_role,
    })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const mode = (['off', 'domain', 'all'] as const).includes(r.mode as AutoShareMode)
    ? (r.mode as AutoShareMode)
    : 'off';
  return { mode, role: (r.role as DriveRole) ?? 'reader' };
}

async function fileIsBroadlyShared(granterUserId: string, driveFileId: string): Promise<boolean> {
  try {
    const perms = await listPermissions(granterUserId, driveFileId);
    return perms.some((p) => p.type === 'domain' || p.type === 'anyone');
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, driveFileId },
      'fileIsBroadlyShared: list failed, treating as not broadly shared',
    );
    return false;
  }
}

export async function shareFileWithMembers(
  workspaceId: string,
  driveFileId: string,
  granterUserId: string,
  mode: AutoShareMode,
  role: DriveRole = 'reader',
): Promise<void> {
  if (mode === 'off') return;
  if (mode === 'domain' && !(await fileIsBroadlyShared(granterUserId, driveFileId))) {
    logger.debug({ driveFileId }, 'auto-share skipped: file not broadly shared');
    return;
  }

  const members = await db
    .select({ user_id: schema.workspace_members.user_id, email: schema.users.email })
    .from(schema.workspace_members)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspace_members.user_id))
    .where(eq(schema.workspace_members.workspace_id, workspaceId));

  for (const m of members) {
    if (m.user_id === granterUserId) continue;
    try {
      await addPermission(granterUserId, driveFileId, {
        type: 'user',
        role,
        email: m.email,
        send_notification_email: false,
      });
    } catch (err) {
      logger.warn(
        { err: (err as Error).message, driveFileId, target: m.email },
        'auto-share grant failed',
      );
    }
  }
}

export async function shareAllFilesWithUser(
  workspaceId: string,
  newUserId: string,
  newUserEmail: string,
  mode: AutoShareMode,
  role: DriveRole = 'reader',
): Promise<void> {
  if (mode === 'off') return;

  const files = await db
    .select({
      drive_file_id: schema.items.drive_file_id,
      created_by: schema.items.created_by,
    })
    .from(schema.items)
    .where(
      and(
        eq(schema.items.workspace_id, workspaceId),
        isNotNull(schema.items.drive_file_id),
        eq(schema.items.is_archived, false),
      ),
    );

  for (const f of files) {
    if (!f.drive_file_id) continue;
    if (f.created_by === newUserId) continue;
    if (mode === 'domain' && !(await fileIsBroadlyShared(f.created_by, f.drive_file_id))) continue;
    try {
      await addPermission(f.created_by, f.drive_file_id, {
        type: 'user',
        role,
        email: newUserEmail,
        send_notification_email: false,
      });
    } catch (err) {
      logger.warn(
        { err: (err as Error).message, driveFileId: f.drive_file_id, granter: f.created_by },
        'back-fill share failed',
      );
    }
  }
}
