import { type Role, roleAtLeast } from '@notdrive/shared';
import { and, eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { db, schema } from '../db/index.js';
import type { Variables } from '../context.js';
import { badRequest, forbidden, notFound } from '../util/errors.js';

export function requireWorkspace(
  minRole: Role = 'viewer',
): MiddlewareHandler<{ Variables: Variables }> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) throw forbidden('auth required');

    const wsId =
      c.req.param('wsId') ?? c.req.header('x-workspace-id') ?? c.req.query('ws');
    if (!wsId) throw badRequest('missing X-Workspace-Id header');

    const row = await db
      .select({
        workspace_id: schema.workspace_members.workspace_id,
        role: schema.workspace_members.role,
        workspace_name: schema.workspaces.name,
      })
      .from(schema.workspace_members)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspace_members.workspace_id))
      .where(
        and(
          eq(schema.workspace_members.workspace_id, wsId),
          eq(schema.workspace_members.user_id, user.id),
        ),
      )
      .limit(1);

    const r = row[0];
    if (!r) throw notFound('workspace not found or not a member');
    const role = r.role as Role;
    if (!roleAtLeast(role, minRole)) throw forbidden(`requires role ${minRole}`);

    c.set('membership', {
      workspace_id: r.workspace_id,
      role,
      workspace_name: r.workspace_name,
    });
    await next();
  };
}
