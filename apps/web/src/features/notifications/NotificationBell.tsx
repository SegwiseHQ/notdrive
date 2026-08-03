import type { NotificationDTO } from '@notdrive/shared';
import * as Popover from '@radix-ui/react-popover';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { http } from '../../lib/http.js';
import { cn } from '../../lib/utils.js';

interface Props {
  wsId: string;
}

/**
 * Bell + popover dropdown of recent notifications. Not realtime — refreshes
 * on open and on tab focus. Acceptable staleness for V1; can promote to SSE
 * if the rate of new mentions ever justifies it.
 */
export function NotificationBell({ wsId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ['notifications', wsId],
    queryFn: http.listNotifications,
    // Refresh whenever the user comes back to the tab. Cheap query; the user
    // expects fresh state when they return after a break.
    refetchOnWindowFocus: true,
    // Periodic background refresh so the badge updates without focus changes.
    refetchInterval: 60_000,
    enabled: !!wsId,
  });

  const markRead = useMutation({
    mutationFn: (ids: string[]) => http.markNotificationsRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', wsId] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => http.markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', wsId] }),
  });

  const unread = query.data?.unread_count ?? 0;
  const notifications = query.data?.notifications ?? [];

  const onClickNotification = (n: NotificationDTO) => {
    if (n.read_at == null) markRead.mutate([n.id]);
    setOpen(false);
    if (n.item_id) {
      // Deep-link straight into the comments drawer for the target page.
      navigate(`/w/${wsId}/i/${n.item_id}?comments=1`);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="relative rounded-md p-1 text-muted-foreground transition hover:bg-muted"
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-none text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[360px] rounded-md border border-border bg-card shadow-xl"
        >
          <header className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Mark all read
              </button>
            )}
          </header>
          <div className="max-h-[420px] overflow-y-auto">
            {query.isLoading && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</p>
            )}
            {!query.isLoading && notifications.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                No notifications yet
              </p>
            )}
            <ul>
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onClickNotification(n)}
                    className={cn(
                      'flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-muted',
                      n.read_at == null && 'bg-blue-500/5',
                    )}
                  >
                    {n.actor?.avatar_url ? (
                      <img
                        src={n.actor.avatar_url}
                        alt=""
                        className="mt-0.5 size-7 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
                        {(n.actor?.name ?? '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs">
                        <span className="font-medium">{n.actor?.name ?? 'Someone'}</span>{' '}
                        <span className="text-muted-foreground">
                          {n.kind === 'comment.mention' ? 'mentioned you in' : 'replied in'}
                        </span>{' '}
                        <span className="font-medium">{n.item_title ?? 'a page'}</span>
                      </p>
                      {n.comment_excerpt && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {n.comment_excerpt}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground/70">
                        {formatRelative(n.created_at)}
                      </p>
                    </div>
                    {n.read_at == null && (
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
