import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { CommentDTO, CommentThreadDTO, Role } from '@notdrive/shared';
import { roleAtLeast } from '@notdrive/shared';
import { db, schema } from '../db/index.js';
import { newId } from '../util/ids.js';
import { forbidden, notFound } from '../util/errors.js';
import { requireVisibleItem } from './items.js';
import { publishItemEvent } from './itemStream.js';
import { createNotification } from './notifications.js';

/**
 * Matches `@[label](user_id)` tokens the composer emits when a user picks an
 * @-mention from the popup. The capture groups are (label, user_id). label is
 * preserved for display; user_id drives notification fan-out.
 */
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

function extractMentionIds(body: string): string[] {
  const ids = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) {
    if (m[2]) ids.add(m[2]);
  }
  return [...ids];
}

/**
 * Returns the page-level thread for this item, creating one on first use.
 * Phase A: at most one thread per item (anchor IS NULL). Phase B will key
 * additional threads on anchor strings for inline comments.
 */
async function getOrCreatePageThread(
  workspaceId: string,
  itemId: string,
  userId: string,
): Promise<string> {
  const existing = await db
    .select({ id: schema.comment_threads.id })
    .from(schema.comment_threads)
    .where(
      and(
        eq(schema.comment_threads.workspace_id, workspaceId),
        eq(schema.comment_threads.item_id, itemId),
        isNull(schema.comment_threads.anchor),
      ),
    )
    .limit(1);

  if (existing[0]) return existing[0].id;

  const id = newId();
  await db.insert(schema.comment_threads).values({
    id,
    workspace_id: workspaceId,
    item_id: itemId,
    anchor: null,
    created_by: userId,
    created_at: Date.now(),
  });
  return id;
}

export async function listForItem(
  workspaceId: string,
  userId: string,
  itemId: string,
): Promise<CommentThreadDTO[]> {
  await requireVisibleItem(workspaceId, userId, itemId);

  // Page-level thread (anchor IS NULL) first, then inline threads ordered
  // by created_at. The sort is computed in code rather than SQL so a
  // straight asc/desc on `anchor` doesn't depend on null-ordering quirks
  // between SQLite and Postgres.
  const threadRows = await db
    .select()
    .from(schema.comment_threads)
    .where(
      and(
        eq(schema.comment_threads.workspace_id, workspaceId),
        eq(schema.comment_threads.item_id, itemId),
      ),
    )
    .orderBy(asc(schema.comment_threads.created_at));

  if (threadRows.length === 0) return [];

  // One query for all comments across all threads on this item — avoids
  // a per-thread fan-out as the thread count grows.
  const threadIds = threadRows.map((t) => t.id);
  const commentRows = await db
    .select({
      id: schema.comments.id,
      thread_id: schema.comments.thread_id,
      body: schema.comments.body,
      created_at: schema.comments.created_at,
      edited_at: schema.comments.edited_at,
      deleted_at: schema.comments.deleted_at,
      user_id: schema.comments.user_id,
      user_name: schema.users.name,
      user_email: schema.users.email,
      user_avatar: schema.users.avatar_url,
    })
    .from(schema.comments)
    .leftJoin(schema.users, eq(schema.users.id, schema.comments.user_id))
    .where(
      and(inArray(schema.comments.thread_id, threadIds), isNull(schema.comments.deleted_at)),
    )
    .orderBy(asc(schema.comments.created_at));

  const byThread = new Map<string, CommentDTO[]>();
  for (const r of commentRows) {
    const list = byThread.get(r.thread_id) ?? [];
    list.push({
      id: r.id,
      thread_id: r.thread_id,
      body: r.body,
      author: r.user_id
        ? {
            id: r.user_id,
            name: r.user_name ?? '',
            email: r.user_email ?? '',
            avatar_url: r.user_avatar ?? null,
          }
        : null,
      created_at: r.created_at,
      edited_at: r.edited_at,
    });
    byThread.set(r.thread_id, list);
  }

  const threads = threadRows.map<CommentThreadDTO>((t) => ({
    id: t.id,
    item_id: t.item_id,
    anchor: t.anchor,
    resolved_at: t.resolved_at,
    created_at: t.created_at,
    comments: byThread.get(t.id) ?? [],
  }));

  // Page-level thread first (anchor IS NULL), then inline by created_at.
  return threads.sort((a, b) => {
    if (a.anchor === null && b.anchor !== null) return -1;
    if (a.anchor !== null && b.anchor === null) return 1;
    return a.created_at - b.created_at;
  });
}

interface CreateCommentInput {
  body: string;
  /** Inline-thread anchor (quoted selection). Ignored when thread_id is set. */
  anchor?: string;
  /** Reply to an existing thread. Wins over anchor. */
  thread_id?: string;
}

export async function createComment(
  workspaceId: string,
  userId: string,
  itemId: string,
  input: CreateCommentInput,
): Promise<{ thread_id: string; comment_id: string; anchor: string | null }> {
  // Visibility check — private pages reject non-owners with a 404 so the
  // presence of the page can't be inferred.
  await requireVisibleItem(workspaceId, userId, itemId);

  // Branch on input: explicit reply → append. Selection → fresh inline
  // thread. Neither → existing get-or-create page-level thread.
  let threadId: string;
  let threadAnchor: string | null;
  if (input.thread_id) {
    const existing = await db
      .select({
        id: schema.comment_threads.id,
        anchor: schema.comment_threads.anchor,
      })
      .from(schema.comment_threads)
      .where(
        and(
          eq(schema.comment_threads.workspace_id, workspaceId),
          eq(schema.comment_threads.item_id, itemId),
          eq(schema.comment_threads.id, input.thread_id),
        ),
      )
      .limit(1);
    if (!existing[0]) throw notFound('thread not found');
    threadId = existing[0].id;
    threadAnchor = existing[0].anchor;
  } else if (input.anchor) {
    threadId = newId();
    threadAnchor = input.anchor;
    await db.insert(schema.comment_threads).values({
      id: threadId,
      workspace_id: workspaceId,
      item_id: itemId,
      anchor: threadAnchor,
      created_by: userId,
      created_at: Date.now(),
    });
  } else {
    threadId = await getOrCreatePageThread(workspaceId, itemId, userId);
    threadAnchor = null;
  }

  const commentId = newId();
  const now = Date.now();
  await db.insert(schema.comments).values({
    id: commentId,
    thread_id: threadId,
    user_id: userId,
    body: input.body,
    created_at: now,
  });

  // Fan-out notifications. Mentions are the strong signal; reply notifications
  // go to every distinct prior participant in the thread who isn't the actor
  // and isn't already getting a mention notification for this comment.
  const mentionedIds = extractMentionIds(input.body);
  const memberRows = mentionedIds.length
    ? await db
        .select({ user_id: schema.workspace_members.user_id })
        .from(schema.workspace_members)
        .where(
          and(
            eq(schema.workspace_members.workspace_id, workspaceId),
            inArray(schema.workspace_members.user_id, mentionedIds),
          ),
        )
    : [];
  const validMentioned = new Set(memberRows.map((r) => r.user_id));

  await Promise.all(
    [...validMentioned].map((recipientId) =>
      createNotification({
        workspaceId,
        recipientId,
        actorId: userId,
        kind: 'comment.mention',
        itemId,
        threadId,
        commentId,
      }),
    ),
  );

  const priorAuthors = await db
    .selectDistinct({ user_id: schema.comments.user_id })
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.thread_id, threadId),
        ne(schema.comments.id, commentId),
        isNull(schema.comments.deleted_at),
      ),
    );

  await Promise.all(
    priorAuthors
      .map((r) => r.user_id)
      .filter((id): id is string => !!id && id !== userId && !validMentioned.has(id))
      .map((recipientId) =>
        createNotification({
          workspaceId,
          recipientId,
          actorId: userId,
          kind: 'comment.reply',
          itemId,
          threadId,
          commentId,
        }),
      ),
  );

  publishItemEvent(itemId, {
    kind: 'comment.added',
    by: userId,
    at: now,
    payload: { thread_id: threadId, comment_id: commentId, anchor: threadAnchor },
  });

  return { thread_id: threadId, comment_id: commentId, anchor: threadAnchor };
}

export async function editComment(
  workspaceId: string,
  userId: string,
  commentId: string,
  body: string,
): Promise<void> {
  // Verify author + visibility in one join. Returns the parent item_id so we
  // can publish the edit event on the correct channel.
  const row = await loadOwnedComment(workspaceId, userId, commentId, { authorOnly: true });

  const now = Date.now();
  await db
    .update(schema.comments)
    .set({ body, edited_at: now })
    .where(eq(schema.comments.id, commentId));

  // Edits intentionally do NOT re-fan-out mention notifications: it's a known
  // foot-gun (edit-spam someone by adding/removing their mention repeatedly).
  // If a real user need surfaces, gate it behind "first mention only" diffing.

  publishItemEvent(row.item_id, {
    kind: 'comment.edited',
    by: userId,
    at: now,
    payload: { thread_id: row.thread_id, comment_id: commentId },
  });
}

export async function deleteComment(
  workspaceId: string,
  userId: string,
  userRole: Role,
  commentId: string,
): Promise<void> {
  const row = await loadOwnedComment(workspaceId, userId, commentId, {
    authorOnly: !roleAtLeast(userRole, 'admin'),
  });

  const now = Date.now();
  await db
    .update(schema.comments)
    .set({ deleted_at: now })
    .where(eq(schema.comments.id, commentId));

  publishItemEvent(row.item_id, {
    kind: 'comment.deleted',
    by: userId,
    at: now,
    payload: { thread_id: row.thread_id, comment_id: commentId },
  });
}

/**
 * Loads a comment + its parent thread + the item it lives under, enforcing:
 *  - the thread exists in this workspace (cross-tenant attempts get 404)
 *  - the caller can see the parent item
 *  - the caller authored the comment when `authorOnly` is true
 *
 * 404 instead of 403 mirrors the rest of the codebase: leaking the existence
 * of resources is itself an information leak when private pages are involved.
 */
async function loadOwnedComment(
  workspaceId: string,
  userId: string,
  commentId: string,
  opts: { authorOnly: boolean },
) {
  const rows = await db
    .select({
      id: schema.comments.id,
      thread_id: schema.comments.thread_id,
      user_id: schema.comments.user_id,
      deleted_at: schema.comments.deleted_at,
      item_id: schema.comment_threads.item_id,
      thread_ws: schema.comment_threads.workspace_id,
    })
    .from(schema.comments)
    .innerJoin(schema.comment_threads, eq(schema.comment_threads.id, schema.comments.thread_id))
    .where(eq(schema.comments.id, commentId))
    .limit(1);

  const row = rows[0];
  if (!row || row.thread_ws !== workspaceId || row.deleted_at != null) {
    throw notFound('comment not found');
  }

  // Visibility check on the parent item. A user who can't see the page can't
  // see (or touch) its comments either.
  await requireVisibleItem(workspaceId, userId, row.item_id);

  if (opts.authorOnly && row.user_id !== userId) {
    throw forbidden('not your comment');
  }

  return row;
}
