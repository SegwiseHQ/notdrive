import type { ItemPathDTO } from '@notdrive/shared';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { http } from '../../lib/http.js';

type ItemEntry = { kind: 'item'; id: string; label: string; current: boolean };

export type ItemBreadcrumbEntry =
  | { kind: 'root'; label: string }
  | { kind: 'gap'; label: string }
  | ItemEntry;

export type CollapsedItemBreadcrumbEntry =
  | ItemBreadcrumbEntry
  | { kind: 'collapsed'; entries: ItemEntry[] };

const MAX_VISIBLE_ANCESTORS = 4;

function itemLabel(title: string): string {
  return title.trim() || 'Untitled';
}

export function buildItemBreadcrumb(
  path: ItemPathDTO | undefined,
  current: { id: string; title: string },
): ItemBreadcrumbEntry[] {
  const entries: ItemBreadcrumbEntry[] = [{ kind: 'root', label: 'All pages' }];
  if (!path?.complete) entries.push({ kind: 'gap', label: '…' });
  for (const ancestor of path?.ancestors ?? []) {
    entries.push({
      kind: 'item',
      id: ancestor.id,
      label: itemLabel(ancestor.title),
      current: false,
    });
  }
  entries.push({
    kind: 'item',
    id: current.id,
    label: itemLabel(current.title),
    current: true,
  });
  return entries;
}

export function collapseItemBreadcrumb(
  entries: ItemBreadcrumbEntry[],
): CollapsedItemBreadcrumbEntry[] {
  const prefix = entries.filter((entry) => entry.kind !== 'item');
  const ancestors = entries.filter(
    (entry): entry is ItemEntry => entry.kind === 'item' && !entry.current,
  );
  const current = entries.find(
    (entry): entry is ItemEntry => entry.kind === 'item' && entry.current,
  );

  if (!current || ancestors.length <= MAX_VISIBLE_ANCESTORS) return entries;
  const firstAncestor = ancestors[0];
  if (!firstAncestor) return entries;

  return [
    ...prefix,
    firstAncestor,
    { kind: 'collapsed', entries: ancestors.slice(1, -2) },
    ...ancestors.slice(-2),
    current,
  ];
}

export function ItemBreadcrumb({
  wsId,
  itemId,
  title,
}: {
  wsId: string;
  itemId: string;
  title: string;
}) {
  const pathQuery = useQuery({
    queryKey: ['item-path', wsId, itemId],
    queryFn: () => http.getItemPath(itemId),
    retry: false,
    // Ancestor changes happen outside this page's item-specific event stream.
    // Keep an open breadcrumb reasonably fresh without polling in background tabs.
    refetchInterval: 60_000,
  });
  const entries = collapseItemBreadcrumb(
    buildItemBreadcrumb(pathQuery.data, { id: itemId, title }),
  );

  return (
    <nav
      aria-label="Page path"
      aria-busy={pathQuery.isLoading}
      className="min-w-0 max-w-full basis-64 grow shrink-0 text-xs text-muted-foreground"
    >
      <ol className="flex min-w-0 flex-wrap items-center gap-y-1">
        {entries.map((entry, index) => (
          <li
            key={
              entry.kind === 'item'
                ? `${entry.id}:${entry.current}`
                : entry.kind === 'collapsed'
                  ? `collapsed:${entry.entries[0]?.id}`
                  : entry.kind
            }
            className="flex min-w-0 items-center"
          >
            {index > 0 && (
              <ChevronRight
                aria-hidden="true"
                className="mx-0.5 size-3 shrink-0 text-muted-foreground/50"
              />
            )}
            {entry.kind === 'root' && (
              <Link
                to={`/w/${wsId}`}
                className="shrink-0 rounded px-1 py-0.5 transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {entry.label}
              </Link>
            )}
            {entry.kind === 'gap' && (
              <span
                className="px-1 py-0.5"
                title={pathQuery.isError ? 'Full path unavailable' : 'Loading page path'}
              >
                {entry.label}
              </span>
            )}
            {entry.kind === 'collapsed' && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="rounded px-1.5 py-0.5 transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={`Show ${entry.entries.length} hidden parent pages`}
                    aria-label={`Show ${entry.entries.length} hidden parent pages`}
                  >
                    …
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="start"
                    className="z-50 max-h-64 w-64 overflow-y-auto rounded-md border border-border bg-card p-1 shadow-lg"
                  >
                    {entry.entries.map((hidden) => (
                      <DropdownMenu.Item key={hidden.id} asChild>
                        <Link
                          to={`/w/${wsId}/i/${hidden.id}`}
                          title={hidden.label}
                          className="block cursor-pointer truncate rounded px-2 py-1.5 text-sm text-foreground outline-none data-[highlighted]:bg-muted"
                        >
                          {hidden.label}
                        </Link>
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
            {entry.kind === 'item' && !entry.current && (
              <Link
                to={`/w/${wsId}/i/${entry.id}`}
                title={entry.label}
                className="max-w-[11rem] truncate rounded px-1 py-0.5 transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {entry.label}
              </Link>
            )}
            {entry.kind === 'item' && entry.current && (
              <span
                aria-current="page"
                title={entry.label}
                className="max-w-[14rem] truncate px-1 py-0.5 font-medium text-foreground"
              >
                {entry.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
