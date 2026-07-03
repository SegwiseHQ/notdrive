import type { Role } from '@notdrive/shared';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { conflict, forbidden, notFound } from '../util/errors.js';
import { newId, now } from '../util/ids.js';

export async function createPersonalWorkspace(userId: string, userName: string) {
  const id = newId();
  const ts = now();
  await db.transaction(async (tx) => {
    await tx.insert(schema.workspaces).values({
      id,
      name: `${userName}'s Workspace`,
      created_by: userId,
      created_at: ts,
    });
    await tx.insert(schema.workspace_members).values({
      workspace_id: id,
      user_id: userId,
      role: 'owner',
      joined_at: ts,
    });
  });
  return id;
}

export async function listWorkspaces(userId: string) {
  const rows = await db
    .select({
      id: schema.workspaces.id,
      name: schema.workspaces.name,
      created_by: schema.workspaces.created_by,
      created_at: schema.workspaces.created_at,
      auto_share_mode: schema.workspaces.auto_share_mode,
      auto_share_role: schema.workspaces.auto_share_role,
      role: schema.workspace_members.role,
    })
    .from(schema.workspace_members)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspace_members.workspace_id))
    .where(eq(schema.workspace_members.user_id, userId));
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}

export async function updateWorkspace(
  workspaceId: string,
  patch: { name?: string; auto_share_mode?: string; auto_share_role?: string },
) {
  const set: Partial<typeof schema.workspaces.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.auto_share_mode !== undefined) set.auto_share_mode = patch.auto_share_mode;
  if (patch.auto_share_role !== undefined) set.auto_share_role = patch.auto_share_role;
  if (Object.keys(set).length === 0) return;
  await db.update(schema.workspaces).set(set).where(eq(schema.workspaces.id, workspaceId));
}

export async function createWorkspace(userId: string, name: string) {
  const id = newId();
  const ts = now();
  await db.transaction(async (tx) => {
    await tx.insert(schema.workspaces).values({ id, name, created_by: userId, created_at: ts });
    await tx.insert(schema.workspace_members).values({
      workspace_id: id,
      user_id: userId,
      role: 'owner',
      joined_at: ts,
    });
  });
  return { id, name, created_by: userId, created_at: ts, role: 'owner' as Role };
}

export async function listMembers(workspaceId: string) {
  return db
    .select({
      user_id: schema.workspace_members.user_id,
      role: schema.workspace_members.role,
      joined_at: schema.workspace_members.joined_at,
      email: schema.users.email,
      name: schema.users.name,
      avatar_url: schema.users.avatar_url,
    })
    .from(schema.workspace_members)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspace_members.user_id))
    .where(eq(schema.workspace_members.workspace_id, workspaceId));
}

export async function updateMemberRole(
  workspaceId: string,
  actorId: string,
  actorRole: Role,
  targetUserId: string,
  newRole: Role,
) {
  if (actorRole !== 'owner' && newRole === 'owner') {
    throw forbidden('only owners can promote to owner');
  }
  if (targetUserId === actorId && newRole !== 'owner') {
    // prevent losing last owner
    const owners = await db
      .select({ uid: schema.workspace_members.user_id })
      .from(schema.workspace_members)
      .where(
        and(
          eq(schema.workspace_members.workspace_id, workspaceId),
          eq(schema.workspace_members.role, 'owner'),
        ),
      );
    if (owners.length <= 1 && owners[0]?.uid === actorId) {
      throw conflict('cannot demote last owner');
    }
  }
  await db
    .update(schema.workspace_members)
    .set({ role: newRole })
    .where(
      and(
        eq(schema.workspace_members.workspace_id, workspaceId),
        eq(schema.workspace_members.user_id, targetUserId),
      ),
    );
}

export async function removeMember(workspaceId: string, actorId: string, targetUserId: string) {
  if (actorId === targetUserId) {
    throw conflict(
      "you can't remove yourself — another owner must do it, or use 'Leave workspace'",
    );
  }
  const res = await db
    .delete(schema.workspace_members)
    .where(
      and(
        eq(schema.workspace_members.workspace_id, workspaceId),
        eq(schema.workspace_members.user_id, targetUserId),
      ),
    );
  if (!res) throw notFound('member not found');
}
