import { type DriveTreeNode, type ItemDTO, sortDriveNodes } from '@notdrive/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  File as FileIcon,
  FileText,
  Folder,
  Link as LinkIcon,
  Plus,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { http } from '../../lib/http.js';
import { useBulk } from '../../lib/store.js';
import { cn } from '../../lib/utils.js';
import { CreateDriveMenu } from '../drive-picker/CreateDriveMenu.js';

/**
 * Renders the user's Drive contents inline in the sidebar.
 *   - Click a folder → expand.
 *   - Click a file not yet linked → open read-only preview drawer. No page created.
 *   - Click a file already linked → navigate to its NotDrive page.
 *   - Click the + on hover → promote a file to a NotDrive page (tags, favorites, hierarchy).
 */
export function DriveTreePanel() {
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

  const { wsId = '' } = useParams();
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

  if (tree.isLoading && !tree.data) {
    return <div className="px-2 py-1 text-[11px] text-muted-foreground">Loading Drive…</div>;
  }
  if (tree.isError) {
    return <div className="px-2 py-1 text-[11px] text-destructive">Couldn't load Drive</div>;
  }
  if (!tree.data?.children) return null;

  return (
    <div className="flex flex-col">
      {sortDriveNodes(tree.data.children).map((n) => (
        <DriveRow key={n.id} node={n} depth={0} linkedMap={linkedMap} />
      ))}
    </div>
  );
}

function DriveRow({
  node,
  depth,
  linkedMap,
}: {
  node: DriveTreeNode;
  depth: number;
  linkedMap: Map<string, ItemDTO>;
}) {
  const { wsId = '' } = useParams();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const isFolder = node.is_folder;
  const linked = linkedMap.get(node.id);
  const selected = useBulk((s) => s.drive.has(node.id));
  const anySelected = useBulk((s) => s.drive.size > 0);
  const toggleDrive = useBulk((s) => s.toggleDrive);

  const onClick = () => {
    if (anySelected && !isFolder) {
      // While in selection mode, plain clicks toggle the file's selection.
      toggleDrive(node.id);
      return;
    }
    if (isFolder) return setExpanded((v) => !v);
    if (linked) return navigate(`/w/${wsId}/i/${linked.id}`);
    navigate(`/w/${wsId}/drive/file/${node.id}`);
  };

  return (
    <div>
      <div
        className={cn(
          'group flex w-full items-center gap-0.5 rounded-md py-[3px] pr-1 text-[13px] transition hover:bg-muted/70',
          selected && 'bg-muted',
        )}
        style={{ paddingLeft: depth * 14 + 2 }}
      >
        {!isFolder && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleDrive(node.id);
            }}
            className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded border-[1.5px] transition',
              selected
                ? 'border-foreground bg-foreground text-background'
                : 'border-muted-foreground/60 bg-background/40 opacity-0 group-hover:opacity-100 hover:border-foreground/70',
              anySelected && 'opacity-100',
            )}
            title="Select"
          >
            {selected && <Check className="size-2.5" strokeWidth={3} />}
          </button>
        )}
        {isFolder && <span className="w-4 shrink-0" />}
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 flex-1 items-center gap-0.5 text-left"
        >
          {isFolder ? (
            <ChevronRight
              className={cn(
                'size-3 shrink-0 text-muted-foreground/60 transition-transform',
                expanded && 'rotate-90',
              )}
            />
          ) : (
            <span className="w-3" />
          )}
          {isFolder ? (
            <Folder className="size-3.5 shrink-0 text-muted-foreground/70" />
          ) : linked ? (
            <FileText className="size-3.5 shrink-0 text-muted-foreground/70" />
          ) : (
            <FileIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
          )}
          <span className="ml-1 min-w-0 flex-1 truncate">{linked ? linked.title : node.name}</span>
        </button>
        {linked && (
          <LinkIcon className="size-3 shrink-0 text-muted-foreground/70" aria-label="Linked" />
        )}
        {isFolder && (
          <CreateDriveMenu
            parentFolderId={node.id}
            trigger={
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-background group-hover:opacity-100"
                title={`Create new Drive file in "${node.name}"`}
              >
                <Plus className="size-3.5" />
              </button>
            }
            onCreated={() => setExpanded(true)}
          />
        )}
      </div>
      {expanded && node.children && (
        <div>
          {sortDriveNodes(node.children).map((c) => (
            <DriveRow key={c.id} node={c} depth={depth + 1} linkedMap={linkedMap} />
          ))}
        </div>
      )}
    </div>
  );
}
