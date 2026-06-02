import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { NotificationDTO, NotificationKind, NotificationListResponseDTO } from '@notdrive/shared';
import { db, schema } from '../db/index.js';
import { newId } from '../util/ids.js';
import { logger } from '../util/logger.js';

interface CreateNotificationArgs {
  workspaceId: string;
  recipientId: string;
  actorId: string;
  kind: NotificationKind;
  itemId?: string | null;
  threadId?: string | null;
  commentId?: string | null;
}

/**
 * Fire-and-forget. A failed notification write must never block the comment
 * write that triggered it — comments are the source of truth; notifications
 * are derived state we can rebuild from comments + mentions if needed.
 */
export async function createNotification(args: CreateNotificationArgs): Promise<void> {
  if (args.recipientId === args.actorId) return; // never self-notify
  try {
    await db.insert(schema.notifications).values({
      id: newId(),
      workspace_id: args.workspaceId,
      user_id: args.recipientId,
      kind: args.kind,
      item_id: args.itemId ?? null,
      thread_id: args.threadId ?? null,
      comment_id: args.commentId ?? null,
      actor_id: args.actorId,
      created_at: Date.now(),
    });
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, kind: args.kind, recipient: args.recipientId },
      'failed to create notification',
    );
  }
}

const EXCERPT_LEN = 140;

export async function listForUser(
  workspaceId: string,
  userId: string,
  limit = 20,
): Promise<NotificationListResponseDTO> {
  // Join actor + item + comment so the dropdown can render rich rows
  // without N+1 fetches. Soft-deleted comments still show the row but with
  // a placeholder excerpt (the comment itself is gone but the notification
  // is still meaningful for context).
  const rows = await db
    .select({
      id: schema.notifications.id,
      kind: schema.notifications.kind,
      item_id: schema.notifications.item_id,
      thread_id: schema.notifications.thread_id,
      comment_id: schema.notifications.comment_id,
      read_at: schema.notifications.read_at,
      created_at: schema.notifications.created_at,
      actor_id: schema.notifications.actor_id,
      actor_name: schema.users.name,
      actor_email: schema.users.email,
      actor_avatar: schema.users.avatar_url,
      item_title: schema.items.title,
      comment_body: schema.comments.body,
      comment_deleted_at: schema.comments.deleted_at,
    })
    .from(schema.notifications)
    .leftJoin(schema.users, eq(schema.users.id, schema.notifications.actor_id))
    .leftJoin(schema.items, eq(schema.items.id, schema.notifications.item_id))
    .leftJoin(schema.comments, eq(schema.comments.id, schema.notifications.comment_id))
    .where(and(eq(schema.notifications.workspace_id, workspaceId), eq(schema.notifications.user_id, userId)))
    .orderBy(desc(schema.notifications.created_at))
    .limit(limit);

  const unreadCountRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.workspace_id, workspaceId),
        eq(schema.notifications.user_id, userId),
        isNull(schema.notifications.read_at),
      ),
    );

  const notifications: NotificationDTO[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind as NotificationKind,
    item_id: r.item_id,
    item_title: r.item_title,
    thread_id: r.thread_id,
    comment_id: r.comment_id,
    comment_excerpt:
      r.comment_body == null
        ? null
        : r.comment_deleted_at != null
          ? '[deleted]'
          : excerpt(r.comment_body, EXCERPT_LEN),
    actor: r.actor_id
      ? {
          id: r.actor_id,
          name: r.actor_name ?? '',
          email: r.actor_email ?? '',
          avatar_url: r.actor_avatar ?? null,
        }
      : null,
    read_at: r.read_at,
    created_at: r.created_at,
  }));

  return { unread_count: Number(unreadCountRow[0]?.n ?? 0), notifications };
}

export async function markRead(workspaceId: string, userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(schema.notifications)
    .set({ read_at: Date.now() })
    .where(
      and(
        eq(schema.notifications.workspace_id, workspaceId),
        eq(schema.notifications.user_id, userId),
        inArray(schema.notifications.id, ids),
        isNull(schema.notifications.read_at),
      ),
    );
}

export async function markAllRead(workspaceId: string, userId: string): Promise<void> {
  await db
    .update(schema.notifications)
    .set({ read_at: Date.now() })
    .where(
      and(
        eq(schema.notifications.workspace_id, workspaceId),
        eq(schema.notifications.user_id, userId),
        isNull(schema.notifications.read_at),
      ),
    );
}

/**
 * Strips mention tokens (`@[label](user_id)` → `@label`) before truncating so
 * the dropdown shows what readers actually see, not the raw wire format.
 */
function excerpt(body: string, max: number): string {
  const stripped = body.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');
  if (stripped.length <= max) return stripped;
  return `${stripped.slice(0, max - 1)}…`;
}
