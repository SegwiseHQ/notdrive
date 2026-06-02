import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ExternalLink,
  Link as LinkIcon,
  Lock,
  LockOpen,
  MoreHorizontal,
  RefreshCw,
  Share2,
  Star,
  Trash2,
  Unlink,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { DrivePicker } from '../features/drive-picker/DrivePicker.js';
import { PageEditor, type PageEditorHandle } from '../features/editor/Editor.js';
import { PageShareDialog } from '../features/share/PageShareDialog.js';
import { ShareDialog } from '../features/share/ShareDialog.js';
import { TagEditor } from '../features/tags/TagEditor.js';
import { apiOrigin } from '../lib/api.js';
import { useNavigateToParent } from '../lib/nav.js';
import { http } from '../lib/http.js';
import { useSelection } from '../lib/store.js';

export function ItemPage() {
  const { wsId = '', itemId = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const select = useSelection((s) => s.select);
  const goToParent = useNavigateToParent();
  const [shareOpen, setShareOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    select(itemId);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [itemId, select]);

  const itemQuery = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => http.getItem(itemId),
    retry: false,
  });
  const childrenQuery = useQuery({
    queryKey: ['items', wsId, itemId],
    queryFn: () => http.listItems({ parent_id: itemId, archived: false }),
  });
  const meQuery = useQuery({ queryKey: ['me'], queryFn: http.me });
  const currentUserId = meQuery.data?.user.id;

  // Live updates: subscribe to /item-stream/:id while this page is open.
  // We DON'T auto-clobber the editor on remote changes — instead surface a
  // banner so the user can decide when to refresh (avoids stomping on
  // in-progress typing).
  const [remoteUpdate, setRemoteUpdate] = useState<{ kind: string; at: number } | null>(null);
  // Imperative handle into the editor so Refresh can replace body in place
  // without remounting. Remounting raced with TipTap+tippy.js DOM cleanup
  // and triggered a React reconciler "removeChild" crash on prod.
  const editorRef = useRef<PageEditorHandle | null>(null);
  // Debounce timer for the banner. Editor saves are debounced at ~600 ms, so
  // a typing burst from the other user produces a stream of events. We wait
  // BANNER_QUIET_MS after the last event before surfacing the banner, so it
  // appears once activity has settled rather than flashing on every keystroke.
  const BANNER_QUIET_MS = 2000;
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!itemId || !currentUserId || !wsId) return;
    // EventSource can't set custom headers, so workspace id rides on the
    // query string — requireWorkspace's middleware reads `?ws=` as a fallback.
    const url = `${apiOrigin()}/item-stream/${encodeURIComponent(itemId)}?ws=${encodeURIComponent(wsId)}`;
    const es = new EventSource(url, { withCredentials: true });
    es.addEventListener('change', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {
          kind: string;
          by: string;
          at: number;
        };
        // Suppress self-events — saves from this tab don't need a banner.
        if (data.by === currentUserId) return;
        if (data.kind === 'archived') {
          // Archive isn't debounced — bounce immediately.
          toast.info('This page was archived');
          goToParent(itemQuery.data?.parent_id);
          return;
        }
        // Reset the timer on every event; banner appears only after
        // BANNER_QUIET_MS of silence.
        if (bannerTimer.current) clearTimeout(bannerTimer.current);
        bannerTimer.current = setTimeout(() => {
          setRemoteUpdate({ kind: data.kind, at: data.at });
        }, BANNER_QUIET_MS);
      } catch {
        // Malformed events shouldn't crash the listener.
      }
    });
    // Auto-reconnect is built into EventSource on transient errors; we just
    // log + let it retry. Hard errors mean the stream is permanently dead.
    es.onerror = () => {
      // EventSource logs its own errors. Just no-op so we don't spam toasts.
    };
    return () => {
      es.close();
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
  }, [itemId, wsId, currentUserId, itemQuery.data?.parent_id, goToParent]);
  // Members list powers the @ mention picker. Cached across page navigations
  // since membership rarely changes; refetched lazily by TanStack defaults.
  const membersQuery = useQuery({
    queryKey: ['workspace-members', wsId],
    queryFn: () => http.members(wsId),
    enabled: !!wsId,
    staleTime: 60_000,
  });
  const mentionItems = (membersQuery.data ?? []).map((m) => ({
    id: m.user_id,
    label: m.name || m.email,
    email: m.email,
    avatar_url: m.avatar_url,
  }));

  const [title, setTitle] = useState('');
  useEffect(() => {
    if (itemQuery.data) setTitle(itemQuery.data.title);
  }, [itemQuery.data?.id]);

  const saveSeq = useRef(0);
  const patch = useMutation({
    mutationFn: async (body: {
      title?: string;
      is_favorite?: boolean;
      body?: string | null;
      visibility?: 'workspace' | 'private';
    }) => {
      const seq = ++saveSeq.current;
      const saved = await http.patchItem(itemId, body);
      return { saved, seq };
    },
    onSuccess: ({ saved, seq }, vars) => {
      // Discard responses from earlier-fired saves that resolved out of order.
      if (seq !== saveSeq.current) return;
      qc.setQueryData(['item', itemId], saved);
      if (
        vars.title !== undefined ||
        vars.is_favorite !== undefined ||
        vars.visibility !== undefined
      ) {
        qc.invalidateQueries({ queryKey: ['items', wsId] });
      }
    },
  });
  const unlink = useMutation({
    mutationFn: () => http.unlinkFile(itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['item', itemId] }),
  });
  const archive = useMutation({
    mutationFn: () => http.archiveItem(itemId),
    onSuccess: () => {
      qc.invalidateQueries();
      select(null);
      toast.success('Archived');
      goToParent(itemQuery.data?.parent_id);
    },
  });

  if (itemQuery.isLoading) return <div className="p-12 text-sm text-muted-foreground">Loading…</div>;
  if (itemQuery.isError || !itemQuery.data) {
    return (
      <div className="mx-auto flex max-w-[640px] flex-col items-center gap-3 p-12 text-center text-sm">
        <p className="text-lg font-medium">This page isn't here.</p>
        <p className="text-muted-foreground">
          It may have been archived or deleted. Return home and check the tree.
        </p>
        <button
          onClick={() => navigate(`/w/${wsId}`)}
          className="mt-2 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background"
        >
          Go home
        </button>
      </div>
    );
  }
  const item = itemQuery.data;
  const driveId = item.drive_file_id;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[880px] flex-col px-12 py-10">
      {remoteUpdate && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <span>
            Someone else updated this page.
            {/* Don't auto-reload — the local editor may have unsaved typing. */}
          </span>
          <button
            onClick={async () => {
              // Refetch, then imperatively replace title + body in place.
              // Remounting the editor (the previous approach) raced with
              // TipTap+tippy.js DOM cleanup and crashed React with a
              // "removeChild" NotFoundError. setContent keeps the editor
              // mounted and side-steps the race entirely.
              await Promise.all([
                qc.invalidateQueries({ queryKey: ['item', itemId] }),
                qc.invalidateQueries({ queryKey: ['items', wsId, itemId] }),
              ]);
              const fresh = qc.getQueryData<typeof item>(['item', itemId]);
              if (fresh) {
                setTitle(fresh.title);
                editorRef.current?.setBody(fresh.body ?? '');
              }
              setRemoteUpdate(null);
            }}
            className="flex shrink-0 items-center gap-1 rounded border border-amber-500/40 bg-amber-500/20 px-2 py-1 font-medium hover:bg-amber-500/30"
          >
            <RefreshCw className="size-3" /> Refresh
          </button>
        </div>
      )}
      <div className="mb-2 flex items-center justify-end gap-1">
        {item.visibility === 'private' && (
          <span
            className="mr-1 flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"
            title="Only you can see this page"
          >
            <Lock className="size-3" /> Private
          </span>
        )}
        <button
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted"
          onClick={() =>
            patch.mutate({
              visibility: item.visibility === 'private' ? 'workspace' : 'private',
            })
          }
          title={
            item.visibility === 'private'
              ? 'Share with workspace'
              : 'Make private (only you can see this and all child pages)'
          }
        >
          {item.visibility === 'private' ? (
            <LockOpen className="size-4" />
          ) : (
            <Lock className="size-4" />
          )}
        </button>
        <button
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted"
          onClick={() => patch.mutate({ is_favorite: !item.is_favorite })}
          title={item.is_favorite ? 'Unstar' : 'Star'}
        >
          <Star className={`size-4 ${item.is_favorite ? 'fill-yellow-500 text-yellow-500' : ''}`} />
        </button>
        <button
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90"
        >
          <Share2 className="size-3" /> Share
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted">
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="z-50 w-52 rounded-md border border-border bg-card p-1 shadow-lg"
            >
              {driveId ? (
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
                  onSelect={() => unlink.mutate()}
                >
                  <Unlink className="size-3.5" /> Unlink file
                </DropdownMenu.Item>
              ) : (
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
                  onSelect={() => setParams({ pick: '1' })}
                >
                  <LinkIcon className="size-3.5" /> Link a Drive file
                </DropdownMenu.Item>
              )}
              {driveId && (
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
                  onSelect={() => setShareOpen(true)}
                >
                  <Share2 className="size-3.5" /> Manage sharing
                </DropdownMenu.Item>
              )}
              {item.drive?.web_view_link && (
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
                  onSelect={() => window.open(item.drive!.web_view_link!, '_blank')}
                >
                  <ExternalLink className="size-3.5" /> Open in Drive
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/10"
                onSelect={() => archive.mutate()}
              >
                <Archive className="size-3.5" /> Archive page
              </DropdownMenu.Item>
              {driveId && (
                <>
                  <DropdownMenu.Item
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/10"
                    onSelect={async () => {
                      if (!confirm('Move this Drive file to trash? Recoverable for 30 days.')) return;
                      try {
                        await http.trashDriveFile(driveId);
                        await http.driveSync();
                        qc.invalidateQueries();
                        toast.success('Moved to Drive trash');
                        goToParent(item.parent_id);
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" /> Move file to Drive trash
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/10"
                    onSelect={async () => {
                      if (
                        !confirm(
                          'PERMANENTLY delete this Drive file? This cannot be undone. Only the file owner can do this.',
                        )
                      )
                        return;
                      try {
                        await http.permanentlyDeleteDriveFile(driveId);
                        qc.invalidateQueries();
                        toast.success('File permanently deleted');
                        goToParent(item.parent_id);
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" /> Delete file forever
                  </DropdownMenu.Item>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title !== item.title && patch.mutate({ title })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        placeholder="Untitled"
        className="w-full border-0 bg-transparent text-4xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
      />

      <div className="mt-3">
        <TagEditor itemId={item.id} tagIds={item.tag_ids} />
      </div>

      {driveId ? (
        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground/80">
            <span>Preview (read-only)</span>
            {item.drive?.web_view_link && (
              <a
                href={item.drive.web_view_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium normal-case tracking-normal text-background hover:opacity-90"
              >
                <ExternalLink className="size-3" /> Edit in Google
              </a>
            )}
          </div>
          <div className="group relative overflow-hidden rounded-lg border border-border bg-muted/30">
            <iframe
              key={driveId}
              title={item.title}
              src={`https://drive.google.com/file/d/${driveId}/preview`}
              className="h-[70vh] w-full border-0"
              allow="autoplay"
            />
            {item.drive?.web_view_link && (
              <a
                href={item.drive.web_view_link}
                target="_blank"
                rel="noreferrer"
                className="pointer-events-auto absolute right-3 top-3 flex items-center gap-1 rounded-full bg-foreground/90 px-3 py-1 text-xs font-medium text-background opacity-0 shadow-lg backdrop-blur transition group-hover:opacity-100"
              >
                <ExternalLink className="size-3" /> Open to edit
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-8">
          <PageEditor
            // Item id is the only key — navigation between pages remounts.
            // Refresh-banner clicks use editorRef.setBody to update content
            // without remounting (avoids tippy.js DOM cleanup race).
            key={item.id}
            ref={editorRef}
            itemId={item.id}
            initialBody={item.body}
            members={mentionItems}
            onChange={(body) => {
              if (saveTimer.current) clearTimeout(saveTimer.current);
              saveTimer.current = setTimeout(() => {
                patch.mutate({ body });
              }, 600);
            }}
          />
        </div>
      )}

      {(childrenQuery.data?.length ?? 0) > 0 && (
        <section className="mt-10">
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground/80">
            <span>Inside</span>
            <button
              onClick={async () => {
                const sub = await http.createItem({ title: 'Untitled', parent_id: item.id });
                qc.invalidateQueries({ queryKey: ['items', wsId, item.id] });
                qc.invalidateQueries({ queryKey: ['items', wsId] });
                navigate(`/w/${wsId}/i/${sub.id}`);
              }}
              className="rounded-md px-2 py-0.5 text-[11px] normal-case tracking-normal text-muted-foreground hover:bg-muted"
            >
              + New sub-page
            </button>
          </div>
          <ul className="flex flex-col">
            {/* Sort the page-view child list alphabetically. The sidebar tree
                still uses rank order so drag-drop reordering works there; this
                list is read-only and a predictable A→Z order beats whichever
                drag order the user might have set previously. */}
            {[...(childrenQuery.data ?? [])]
              .sort((a, b) =>
                (a.title || 'Untitled').localeCompare(b.title || 'Untitled', undefined, {
                  sensitivity: 'base',
                  numeric: true,
                }),
              )
              .map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => navigate(`/w/${wsId}/i/${c.id}`)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-muted"
                >
                  <span className="text-muted-foreground">
                    {c.type === 'file' ? '📎' : '📄'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.title || 'Untitled'}</span>
                  {c.drive?.mime_type && (
                    <span className="truncate text-xs text-muted-foreground">{c.drive.mime_type.split('.').pop()}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!driveId && (childrenQuery.data?.length ?? 0) === 0 && (
        <div className="mt-12 flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
          <p>This page is empty.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const sub = await http.createItem({ title: 'Untitled', parent_id: item.id });
                qc.invalidateQueries({ queryKey: ['items', wsId, item.id] });
                qc.invalidateQueries({ queryKey: ['items', wsId] });
                navigate(`/w/${wsId}/i/${sub.id}`);
              }}
              className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              + New sub-page
            </button>
            <button
              onClick={() => setParams({ pick: '1' })}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Link a Drive file
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground/70">
            Tip: use this page as a folder by adding sub-pages inside it.
          </p>
        </div>
      )}

      {params.get('pick') === '1' && (
        <DrivePicker
          onClose={() => setParams({})}
          onPick={async (fileId) => {
            await http.linkFile(itemId, fileId);
            qc.invalidateQueries({ queryKey: ['item', itemId] });
            setParams({});
            toast.success('Linked');
          }}
        />
      )}
      {driveId ? (
        <ShareDialog
          fileId={driveId}
          fileName={item.drive?.name ?? item.title}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      ) : (
        <PageShareDialog itemId={item.id} open={shareOpen} onOpenChange={setShareOpen} />
      )}
    </div>
  );
}
