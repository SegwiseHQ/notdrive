import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CommentDTO } from '@notdrive/shared';
import { Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { MentionItem } from '../editor/MentionMenu.js';
import { http } from '../../lib/http.js';
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
}

export function CommentsPanel({ itemId, open, onOpenChange, members, currentUserId, isAdmin }: Props) {
  const qc = useQueryClient();
  const key = ['comments', itemId] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: () => http.listComments(itemId),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: (body: string) => http.createComment(itemId, { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error((e as Error).message),
  });

  const comments = query.data?.thread?.comments ?? [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Lighter overlay so the page underneath stays visible — this is a
            side drawer, not a modal that demands focus. */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-[95vw] flex-col border-l border-border bg-background shadow-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right"
          // Don't auto-focus inside the panel on open; the user is reading
          // the page, not the panel. They'll click in when they want to type.
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

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {query.isLoading && (
              <p className="text-xs text-muted-foreground">Loading…</p>
            )}
            {!query.isLoading && comments.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No comments yet. Start the discussion.
              </p>
            )}
            <ul className="flex flex-col gap-4">
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
          </div>

          <div className="border-t border-border px-4 py-3">
            <CommentComposer
              members={members}
              busy={create.isPending}
              onSubmit={async (body) => {
                await create.mutateAsync(body);
              }}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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

function formatRelative(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(epochMs).toLocaleDateString();
}
