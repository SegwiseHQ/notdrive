import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ItemDTO } from '@notdrive/shared';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ChevronRight,
  Copy,
  File,
  FileText,
  Lock,
  MoreHorizontal,
  Plus,
  Star,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { http } from '../../lib/http.js';
import { useNavigateToParent } from '../../lib/nav.js';
import { useSelection } from '../../lib/store.js';
import { cn } from '../../lib/utils.js';

export function TreePanel({ wsId }: { wsId: string }) {
  const rootQuery = useQuery({
    queryKey: ['items', wsId, 'root'],
    queryFn: () => http.listItems({ root: true, archived: false }),
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const qc = useQueryClient();

  const onDragEnd = async (e: DragEndEvent) => {
    const activeId = e.active.id as string;
    const overId = e.over?.id as string | undefined;
    if (!overId || activeId === overId) return;

    // overId can be an item id ("before" drop) or a synthetic "child-of:<id>" (parent drop).
    if (overId.startsWith('child-of:')) {
      const parentId = overId.slice('child-of:'.length);
      await http.moveItem(activeId, { parent_id: parentId === 'root' ? null : parentId });
    } else {
      const target = (rootQuery.data ?? []).find((x) => x.id === overId);
      if (target) {
        await http.moveItem(activeId, { parent_id: target.parent_id, before_id: target.id });
      }
    }
    qc.invalidateQueries({ queryKey: ['items', wsId] });
  };

  if (rootQuery.isLoading)
    return <div className="px-2 py-1 text-xs text-muted-foreground">Loading…</div>;
  const items = sortByTitle(rootQuery.data ?? []);
  if (items.length === 0)
    return <div className="px-2 py-1 text-xs text-muted-foreground">No pages yet</div>;

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((it) => (
          <TreeRow key={it.id} item={it} depth={0} />
        ))}
      </SortableContext>
    </DndContext>
  );
}

/**
 * Sort items by title alphabetically with natural numeric ordering, so
 * `Sprint 2` precedes `Sprint 10`. Case-insensitive. The sidebar tree used
 * to display in rank order (drag-drop output), but for typical use a
 * predictable A→Z order beats whichever rank values happened to land
 * during bulk imports.
 *
 * NOTE: This makes within-parent drag-reorder visually a no-op (the sort
 * overrides the new rank). Drag-to-different-parent still works as before.
 */
function sortByTitle(items: ItemDTO[]): ItemDTO[] {
  return [...items].sort((a, b) =>
    (a.title || 'Untitled').localeCompare(b.title || 'Untitled', undefined, {
      sensitivity: 'base',
      numeric: true,
    }),
  );
}

function TreeRow({ item, depth }: { item: ItemDTO; depth: number }) {
  const { wsId = '', itemId: currentItemId } = useParams();
  const navigate = useNavigate();
  const goToParent = useNavigateToParent();
  const qc = useQueryClient();
  const select = useSelection((s) => s.select);
  const [expanded, setExpanded] = useState(false);
  const childrenQuery = useQuery({
    queryKey: ['items', wsId, item.id],
    queryFn: () => http.listItems({ parent_id: item.id, archived: false }),
    enabled: expanded,
  });

  const sortable = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={cn(sortable.isDragging && 'opacity-50')}
    >
      <div
        className="group flex items-center gap-0.5 rounded-md py-[3px] pr-1 text-[13px] transition hover:bg-muted/70"
        style={{ paddingLeft: depth * 14 + 2 }}
      >
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex size-4 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground"
        >
          <ChevronRight className={cn('size-3 transition-transform', expanded && 'rotate-90')} />
        </button>
        {item.type === 'file' ? (
          <File className="size-3.5 shrink-0 text-muted-foreground/70" />
        ) : (
          <FileText className="size-3.5 shrink-0 text-muted-foreground/70" />
        )}
        <Link
          to={`/w/${wsId}/i/${item.id}`}
          onClick={() => select(item.id)}
          className="ml-1 min-w-0 flex-1 truncate"
          {...sortable.attributes}
          {...sortable.listeners}
        >
          {item.title || 'Untitled'}
        </Link>
        {item.visibility === 'private' && <Lock className="size-3 shrink-0 text-amber-500" />}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-background group-hover:opacity-100"
              title="More"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={2}
              className="z-50 w-48 rounded-md border border-border bg-card p-1 shadow-lg"
            >
              <DropdownMenu.Item
                onSelect={async () => {
                  const sub = await http.createItem({ title: 'Untitled', parent_id: item.id });
                  setExpanded(true);
                  await qc.invalidateQueries({ queryKey: ['items', wsId, item.id] });
                  await qc.invalidateQueries({ queryKey: ['items', wsId] });
                  navigate(`/w/${wsId}/i/${sub.id}`);
                }}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
              >
                <Plus className="size-3.5" /> New sub-page
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={async () => {
                  await http.patchItem(item.id, { is_favorite: !item.is_favorite });
                  await qc.invalidateQueries({ queryKey: ['items', wsId] });
                  await qc.invalidateQueries({ queryKey: ['item', item.id] });
                }}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
              >
                <Star
                  className={`size-3.5 ${item.is_favorite ? 'fill-yellow-500 text-yellow-500' : ''}`}
                />
                {item.is_favorite ? 'Unstar' : 'Star'}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={async () => {
                  const toastId = toast.loading('Duplicating…');
                  try {
                    const copy = await http.duplicateItem(item.id);
                    await qc.invalidateQueries({ queryKey: ['items', wsId] });
                    toast.success('Duplicated', { id: toastId });
                    navigate(`/w/${wsId}/i/${copy.id}`);
                  } catch (e) {
                    toast.error(`Duplicate failed: ${(e as Error).message}`, { id: toastId });
                  }
                }}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
              >
                <Copy className="size-3.5" /> Duplicate
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                onSelect={async () => {
                  if (!confirm(`Archive "${item.title || 'Untitled'}"?`)) return;
                  await http.archiveItem(item.id);
                  await qc.invalidateQueries({ queryKey: ['items', wsId] });
                  const sel = useSelection.getState();
                  if (sel.selectedItemId === item.id) sel.select(null);
                  // If we're currently viewing the archived item, navigate to
                  // its parent (preferred) or the workspace root.
                  if (currentItemId === item.id) goToParent(item.parent_id);
                  toast.success('Archived');
                }}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/10"
              >
                <Archive className="size-3.5" /> Archive
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {expanded &&
        childrenQuery.data &&
        (() => {
          const sortedChildren = sortByTitle(childrenQuery.data);
          return (
            <SortableContext
              items={sortedChildren.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {sortedChildren.map((c) => (
                <TreeRow key={c.id} item={c} depth={depth + 1} />
              ))}
            </SortableContext>
          );
        })()}
    </div>
  );
}

export type { DragOverEvent };
