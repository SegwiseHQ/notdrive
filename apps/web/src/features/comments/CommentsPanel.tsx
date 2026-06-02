import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CommentDTO, CommentThreadDTO } from '@notdrive/shared';
import { Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { MentionItem } from '../editor/MentionMenu.js';
import { http } from '../../lib/http.js';
import { cn } from '../../lib/utils.js';
import { CommentComposer } from './CommentComposer.js';
import { tokenizeCommentBody } from './mentions.js';

interface Props {
  itemId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  members: MentionItem[];
  currentUserId: string | undefined;
  /** 'admin'/'owner' can delete any comment; everyone else only their own. */
  isAdmin: boolean;
  /**
   * Selection captured from the bubble toolbar's "Comment" button. When set,
   * the drawer renders a pending inline thread at the bottom of the list
   * with the anchor preview + an open composer. Cleared on submit/cancel.
   */
  pendingInline: { from: number; to: number; text: string } | null;
  /**
   * Called when the pending inline thread is submitted. Caller is expected
   * to create the thread server-side, then apply the comment mark to the
   * editor with the returned thread id.
   */
  onPendingSubmit: (body: string) => Promise<void>;
  /** Cancel without creating a thread. */
  onPendingCancel: () => void;
  /**
   * Thread id to scroll into view when the drawer opens — set when the user
   * clicks an inline highlight in the editor. The panel scrolls + briefly
   * pulses the thread, then calls onFocusConsumed.
   */
  focusThreadId: string | null;
  onFocusConsumed: () => void;
}

export function CommentsPanel({
  itemId,
  open,
  onOpenChange,
  members,
  currentUserId,
  isAdmin,
  pendingInline,
  onPendingSubmit,
  onPendingCancel,
  focusThreadId,
  onFocusConsumed,
}: Props) {
  const qc = useQueryClient();
  const key = ['comments', itemId] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: () => http.listComments(itemId),
    enabled: open,
  });

  const threads = query.data?.threads ?? [];
  const pageThread = threads.find((t) => t.anchor === null) ?? null;
  const inlineThreads = threads.filter((t) => t.anchor !== null);

  // Page-level composer (the existing UX from Phase A).
  const createPage = useMutation({
    mutationFn: (body: string) =>
      http.createComment(itemId, pageThread ? { body, thread_id: pageThread.id } : { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error((e as Error).message),
  });

  // Reply to a specific inline thread.
  const replyToInline = useMutation({
    mutationFn: ({ threadId, body }: { threadId: string; body: string }) =>
      http.createComment(itemId, { body, thread_id: threadId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error((e as Error).message),
  });

  // Scroll-to-focus when a mark click opens the drawer pointing at a thread.
  const threadRefs = useRef(new Map<string, HTMLLIElement>());
  const [pulseId, setPulseId] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !focusThreadId) return;
    // Wait for next frame so the threads list has rendered after the data
    // fetch settles — otherwise the ref isn't registered yet.
    const t = setTimeout(() => {
      const el = threadRefs.current.get(focusThreadId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setPulseId(focusThreadId);
        setTimeout(() => setPulseId(null), 1600);
      }
      onFocusConsumed();
    }, 50);
    return () => clearTimeout(t);
  }, [open, focusThreadId, threads.length, onFocusConsumed]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-[95vw] flex-col border-l border-border bg-background shadow-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <Dialog.Title className="text-sm font-semibold">Comments</Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="flex-1 overflow-y-auto">
            {query.isLoading && (
              <p className="px-4 py-3 text-xs text-muted-foreground">Loading…</p>
            )}

            {/* Page-level thread first. Inline-with-existing-comments empty
                state still renders the composer so users can start the
                discussion. */}
            <ThreadBlock
              thread={pageThread}
              fallbackTitle="On this page"
              members={members}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              itemId={itemId}
              pulse={pulseId === pageThread?.id}
              registerRef={(el) => {
                if (pageThread && el) threadRefs.current.set(pageThread.id, el);
              }}
              persistentComposer
              composerBusy={createPage.isPending}
              onSubmitComposer={(body) => createPage.mutateAsync(body).then(() => {})}
            />

            {/* Inline threads. */}
            <ul className="flex flex-col">
              {inlineThreads.map((t) => (
                <ThreadBlock
                  key={t.id}
                  thread={t}
                  members={members}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  itemId={itemId}
                  pulse={pulseId === t.id}
                  registerRef={(el) => {
                    if (el) threadRefs.current.set(t.id, el);
                  }}
                  persistentComposer={false}
                  composerBusy={replyToInline.isPending}
                  onSubmitComposer={(body) =>
                    replyToInline.mutateAsync({ threadId: t.id, body }).then(() => {})
                  }
                />
              ))}
            </ul>

            {/* Pending inline thread (after the user clicked Comment on a
                selection but hasn't sent yet). Rendered last so it's
                naturally at the bottom near where their attention is. */}
            {pendingInline && (
              <PendingInlineBlock
                anchor={pendingInline.text}
                members={members}
                onSubmit={onPendingSubmit}
                onCancel={onPendingCancel}
              />
            )}

            {!query.isLoading && !pageThread && inlineThreads.length === 0 && !pendingInline && (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                No comments yet. Start the discussion below, or select text in the page to comment on it.
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ThreadBlock({
  thread,
  fallbackTitle,
  members,
  currentUserId,
  isAdmin,
  itemId,
  pulse,
  registerRef,
  persistentComposer,
  composerBusy,
  onSubmitComposer,
}: {
  thread: CommentThreadDTO | null;
  fallbackTitle?: string;
  members: MentionItem[];
  currentUserId: string | undefined;
  isAdmin: boolean;
  itemId: string;
  pulse: boolean;
  registerRef: (el: HTMLLIElement | null) => void;
  persistentComposer: boolean;
  composerBusy: boolean;
  onSubmitComposer: (body: string) => Promise<void>;
}) {
  const [replying, setReplying] = useState(false);
  const comments = thread?.comments ?? [];

  // Don't render the page-level block at all when it's empty and we don't
  // have a persistent composer to attach — keeps the drawer clean when only
  // inline threads exist.
  if (!thread && !persistentComposer) return null;

  return (
    <li
      ref={registerRef}
      className={cn(
        'border-b border-border/60 transition',
        pulse && 'ring-2 ring-yellow-400/60',
      )}
    >
      <div className="px-4 py-3">
        {thread?.anchor && (
          <blockquote className="mb-2 border-l-2 border-yellow-400/50 bg-yellow-200/10 px-2 py-1 text-xs italic text-muted-foreground">
            {truncate(thread.anchor, 200)}
          </blockquote>
        )}
        {!thread?.anchor && fallbackTitle && comments.length > 0 && (
          <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {fallbackTitle}
          </p>
        )}

        {comments.length > 0 && (
          <ul className="flex flex-col gap-3">
            {comments.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                itemId={itemId}
                members={members}
                canEdit={c.author?.id === currentUserId}
                canDelete={c.author?.id === currentUserId || isAdmin}
              />
            ))}
          </ul>
        )}

        {persistentComposer ? (
          <div className="mt-3">
            <CommentComposer
              members={members}
              busy={composerBusy}
              onSubmit={onSubmitComposer}
            />
          </div>
        ) : replying ? (
          <div className="mt-2">
            <CommentComposer
              members={members}
              busy={composerBusy}
              submitLabel="Reply"
              onSubmit={async (body) => {
                await onSubmitComposer(body);
                setReplying(false);
              }}
              onCancel={() => setReplying(false)}
            />
          </div>
        ) : (
          <button
            onClick={() => setReplying(true)}
            className="mt-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            Reply
          </button>
        )}
      </div>
    </li>
  );
}

function PendingInlineBlock({
  anchor,
  members,
  onSubmit,
  onCancel,
}: {
  anchor: string;
  members: MentionItem[];
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="border-b border-border/60 bg-yellow-500/5 px-4 py-3">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
        New comment on selection
      </p>
      <blockquote className="mb-2 border-l-2 border-yellow-400/60 bg-yellow-200/15 px-2 py-1 text-xs italic text-muted-foreground">
        {truncate(anchor, 200)}
      </blockquote>
      <CommentComposer
        members={members}
        busy={busy}
        submitLabel="Comment"
        onCancel={onCancel}
        onSubmit={async (body) => {
          setBusy(true);
          try {
            await onSubmit(body);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function CommentRow({
  comment,
  itemId,
  members,
  canEdit,
  canDelete,
}: {
  comment: CommentDTO;
  itemId: string;
  members: MentionItem[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const qc = useQueryClient();
  const key = ['comments', itemId] as const;
  const [editing, setEditing] = useState(false);

  const edit = useMutation({
    mutationFn: (body: string) => http.editComment(comment.id, { body }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: () => http.deleteComment(comment.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <li className="group flex gap-2">
      {comment.author?.avatar_url ? (
        <img
          src={comment.author.avatar_url}
          alt=""
          className="size-7 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
          {(comment.author?.name ?? '?').charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium">{comment.author?.name ?? 'Unknown'}</span>
          <span className="text-[10px] text-muted-foreground">
            {formatRelative(comment.created_at)}
            {comment.edited_at && ' · edited'}
          </span>
          <div className="ml-auto flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            {canEdit && !editing && (
              <button
                aria-label="Edit"
                onClick={() => setEditing(true)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <Pencil className="size-3" />
              </button>
            )}
            {canDelete && (
              <button
                aria-label="Delete"
                onClick={() => {
                  if (confirm('Delete this comment?')) del.mutate();
                }}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
        </div>
        {editing ? (
          <div className="mt-1">
            <CommentComposer
              members={members}
              initial={comment.body}
              submitLabel="Save"
              busy={edit.isPending}
              onSubmit={async (body) => {
                await edit.mutateAsync(body);
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
            {tokenizeCommentBody(comment.body).map((t, i) =>
              t.kind === 'mention' ? (
                <span
                  key={i}
                  className="rounded bg-blue-500/10 px-1 py-0.5 text-[12.5px] font-medium text-blue-600 dark:text-blue-400"
                >
                  @{t.label}
                </span>
              ) : (
                <span key={i}>{t.text}</span>
              ),
            )}
          </p>
        )}
      </div>
    </li>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function formatRelative(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(epochMs).toLocaleDateString();
}
