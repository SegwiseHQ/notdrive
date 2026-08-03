import { type DriveTreeNode, type ItemDTO, sortDriveNodes } from '@notdrive/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  ExternalLink,
  File as FileIcon,
  FileText,
  Folder,
  Home,
  LayoutGrid,
  Link as LinkIcon,
  List,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { CreateDriveMenu } from '../features/drive-picker/CreateDriveMenu.js';
import { http } from '../lib/http.js';
import { cn } from '../lib/utils.js';

type Layout = 'list' | 'grid';

export function DrivePage() {
  const { wsId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [layout, setLayout] = useState<Layout>('list');
  const [q, setQ] = useState('');

  const tree = useQuery({
    queryKey: ['drive-tree'],
    queryFn: async () => {
      const t = await http.driveTree(4);
      try {
        localStorage.setItem('notdrive.drive-tree', JSON.stringify({ t, at: Date.now() }));
      } catch {}
      return t;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: () => {
      try {
        const raw = localStorage.getItem('notdrive.drive-tree');
        if (!raw) return undefined;
        const { t, at } = JSON.parse(raw) as { t: DriveTreeNode; at: number };
        if (Date.now() - at > 24 * 60 * 60 * 1000) return undefined;
        return t;
      } catch {
        return undefined;
      }
    },
  });

  // Any NotDrive item already linked to a Drive file → show as a "linked page".
  const allItems = useQuery({
    queryKey: ['items', wsId, 'linked'],
    queryFn: () => http.listItems({ archived: false, linked_only: true, limit: 500 }),
    staleTime: 2 * 60 * 1000,
  });
  const linkedMap = useMemo(() => {
    const m = new Map<string, ItemDTO>();
    for (const it of allItems.data ?? []) {
      if (it.drive_file_id) m.set(it.drive_file_id, it);
    }
    return m;
  }, [allItems.data]);

  const pathKey = params.get('p') ?? '';
  const pathIds = useMemo(() => pathKey.split(',').filter(Boolean), [pathKey]);
  const trail = useMemo(() => {
    if (!tree.data) return [] as DriveTreeNode[];
    const out: DriveTreeNode[] = [tree.data];
    let cursor = tree.data;
    for (const id of pathIds) {
      const next = cursor.children?.find((c) => c.id === id && c.is_folder);
      if (!next) break;
      out.push(next);
      cursor = next;
    }
    return out;
  }, [tree.data, pathIds]);

  const currentFolder = trail[trail.length - 1] ?? tree.data;
  const needle = q.trim().toLowerCase();
  const searching = needle.length > 0;

  // Recursive search across the whole cached tree (depth up to 4 from the
  // server). Returns matches with their breadcrumb path so users can see
  // where a hit lives without drilling in.
  const localMatches = useMemo(() => {
    if (!searching || !tree.data) return [] as Array<{ node: DriveTreeNode; path: string[] }>;
    const out: Array<{ node: DriveTreeNode; path: string[] }> = [];
    const walk = (node: DriveTreeNode, path: string[]) => {
      if (node.name.toLowerCase().includes(needle) && node !== tree.data) {
        out.push({ node, path });
      }
      if (node.children) {
        for (const c of node.children) walk(c, [...path, node.name]);
      }
    };
    walk(tree.data, []);
    return out
      .sort((a, b) => {
        if (a.node.is_folder !== b.node.is_folder) return a.node.is_folder ? -1 : 1;
        return a.node.name.localeCompare(b.node.name);
      })
      .slice(0, 200);
  }, [tree.data, needle, searching]);

  // Server-side Drive search reaches files below the cached depth. Debounced
  // by TanStack's enabled gate + the 300ms key churn.
  const remoteSearch = useQuery({
    queryKey: ['drive-search', needle],
    queryFn: () => http.driveSearch(needle, 50),
    enabled: searching && needle.length >= 2,
    staleTime: 30_000,
  });

  const searchResults = useMemo(() => {
    if (!searching) return [] as Array<{ node: DriveTreeNode; path: string[] }>;
    const seen = new Set(localMatches.map((m) => m.node.id));
    const remote = (remoteSearch.data ?? [])
      .filter((n) => !seen.has(n.id))
      .map((n) => ({ node: n, path: [] }));
    return [...localMatches, ...remote];
  }, [localMatches, remoteSearch.data, searching]);

  const children = useMemo(() => {
    if (!currentFolder?.children) return [] as DriveTreeNode[];
    return sortDriveNodes(currentFolder.children);
  }, [currentFolder]);

  const sync = useMutation({
    mutationFn: () => http.driveSync(),
    onSuccess: (r) => {
      toast.success(`Synced ${r.processed} change(s)`);
      qc.invalidateQueries({ queryKey: ['drive-tree'] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });

  const pushFolder = (folder: DriveTreeNode) => {
    const next = [...pathIds, folder.id];
    setParams({ p: next.join(',') });
  };
  const goUpTo = (index: number) => {
    if (index <= 0) setParams({});
    else setParams({ p: pathIds.slice(0, index).join(',') });
  };

  const openNode = (node: DriveTreeNode) => {
    if (node.is_folder) return pushFolder(node);
    const existing = linkedMap.get(node.id);
    if (existing) return navigate(`/w/${wsId}/i/${existing.id}`);
    // Preview raw Drive file in the center.
    navigate(`/w/${wsId}/drive/file/${node.id}`);
  };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1040px] flex-1 flex-col px-12 py-10">
      <div className="mb-4 flex items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => goUpTo(0)}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition hover:bg-muted"
        >
          <Home className="size-3.5" />
          My Drive
        </button>
        {trail.slice(1).map((node, i) => (
          <div key={node.id} className="flex items-center gap-1">
            <ChevronRight className="size-3 text-muted-foreground/60" />
            <button
              type="button"
              onClick={() => goUpTo(i + 1)}
              className="rounded-md px-1.5 py-0.5 text-muted-foreground transition hover:bg-muted"
            >
              {node.name}
            </button>
          </div>
        ))}
      </div>

      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold tracking-tight">
            {currentFolder?.name ?? 'My Drive'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Click a file to preview it. Click a folder to drill in.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border pl-2">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter…"
              className="w-40 bg-transparent px-2 py-1 text-sm outline-none"
            />
          </div>
          <div className="flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5">
            {(['list', 'grid'] as const).map((l) => {
              const Icon = l === 'list' ? List : LayoutGrid;
              return (
                <button
                  type="button"
                  key={l}
                  onClick={() => setLayout(l)}
                  className={cn(
                    'rounded p-1.5 text-muted-foreground transition',
                    layout === l
                      ? 'bg-background text-foreground shadow-sm'
                      : 'hover:text-foreground',
                  )}
                  title={l}
                >
                  <Icon className="size-3.5" />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            <RefreshCw className={`size-3.5 ${sync.isPending ? 'animate-spin' : ''}`} /> Sync
          </button>
          <CreateDriveMenu parentFolderId={currentFolder?.id} />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {tree.isLoading && !tree.data && (
          <div className="text-sm text-muted-foreground">Loading Drive…</div>
        )}
        {tree.isError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            Couldn't load Drive. Try re-signing in.
          </div>
        )}

        {searching ? (
          <>
            <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground/80">
              <span>Search results · {searchResults.length}</span>
              {remoteSearch.isFetching && <span className="normal-case">searching Drive…</span>}
            </div>
            {searchResults.length === 0 && !remoteSearch.isFetching && (
              <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                No matches.
              </div>
            )}
            <ul className="flex flex-col">
              {searchResults.map(({ node, path }) => (
                <Row
                  key={node.id}
                  node={node}
                  linkedItem={linkedMap.get(node.id)}
                  pathLabel={path.join(' / ')}
                  onOpen={() => openNode(node)}
                />
              ))}
            </ul>
          </>
        ) : (
          <>
            {!tree.isLoading && children.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                Empty folder.
              </div>
            )}
            {children.length > 0 && layout === 'list' && (
              <ul className="flex flex-col">
                {children.map((c) => (
                  <Row
                    key={c.id}
                    node={c}
                    linkedItem={linkedMap.get(c.id)}
                    onOpen={() => openNode(c)}
                  />
                ))}
              </ul>
            )}
            {children.length > 0 && layout === 'grid' && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {children.map((c) => (
                  <Card
                    key={c.id}
                    node={c}
                    linkedItem={linkedMap.get(c.id)}
                    onOpen={() => openNode(c)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  node,
  linkedItem,
  pathLabel,
  onOpen,
}: {
  node: DriveTreeNode;
  linkedItem: ItemDTO | undefined;
  pathLabel?: string;
  onOpen: () => void;
}) {
  const isFolder = node.is_folder;
  const isLinked = !!linkedItem;
  return (
    <li>
      <div className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition hover:bg-muted/70">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {isFolder ? (
            <Folder className="size-3.5 shrink-0 text-muted-foreground/80" />
          ) : isLinked ? (
            <FileText className="size-3.5 shrink-0 text-muted-foreground/80" />
          ) : (
            <FileIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">
              {isLinked ? linkedItem.title : node.name}
              {isLinked && linkedItem.title !== node.name && (
                <span className="ml-2 text-[11px] text-muted-foreground">· {node.name}</span>
              )}
            </span>
            {pathLabel && (
              <span className="truncate text-[11px] text-muted-foreground">
                {pathLabel || 'My Drive'}
              </span>
            )}
          </span>
          {isLinked && (
            <span className="flex items-center gap-1 rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              <LinkIcon className="size-2.5" /> Linked
            </span>
          )}
          {node.modified_time && !isLinked && (
            <span className="hidden text-[11px] text-muted-foreground md:inline">
              {new Date(node.modified_time).toLocaleDateString()}
            </span>
          )}
        </button>
        {isFolder && (
          <CreateDriveMenu
            parentFolderId={node.id}
            trigger={
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground opacity-0 transition hover:bg-background group-hover:opacity-100"
                title={`Create new Drive file inside "${node.name}"`}
              >
                + New
              </button>
            }
          />
        )}
        {!isFolder && !isLinked && (
          <a
            href={`https://drive.google.com/file/d/${node.id}/view`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-background group-hover:opacity-100"
            title="Open in Drive"
          >
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </li>
  );
}

function Card({
  node,
  linkedItem,
  onOpen,
}: {
  node: DriveTreeNode;
  linkedItem: ItemDTO | undefined;
  onOpen: () => void;
}) {
  const isFolder = node.is_folder;
  const isLinked = !!linkedItem;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex aspect-[4/3] cursor-pointer flex-col justify-between rounded-md border p-3 text-left transition hover:border-ring hover:bg-muted/60',
        isLinked ? 'border-border bg-muted/30' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between">
        {isFolder ? (
          <Folder className="size-6 text-muted-foreground" />
        ) : isLinked ? (
          <FileText className="size-6 text-muted-foreground" />
        ) : (
          <FileIcon className="size-6 text-muted-foreground" />
        )}
        {isLinked && (
          <span className="flex items-center gap-1 rounded-full bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <LinkIcon className="size-2.5" /> Linked
          </span>
        )}
      </div>
      <div>
        <div className="truncate text-sm font-medium">
          {isLinked ? linkedItem.title : node.name}
        </div>
        {isLinked ? (
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{node.name}</div>
        ) : (
          node.modified_time && (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {new Date(node.modified_time).toLocaleDateString()}
            </div>
          )
        )}
      </div>
    </button>
  );
}
