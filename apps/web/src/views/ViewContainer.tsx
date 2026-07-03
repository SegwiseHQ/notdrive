import type { ItemDTO, ViewLayout } from '@notdrive/shared';
import { Grid3x3, LayoutGrid, List, Rows3 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/utils.js';
import { GridView } from './GridView.js';
import { ListView } from './ListView.js';
import { TagboardView } from './TagboardView.js';
import { TimelineView } from './TimelineView.js';

const ICON: Record<ViewLayout, React.ComponentType<{ className?: string }>> = {
  list: List,
  grid: LayoutGrid,
  timeline: Rows3,
  tagboard: Grid3x3,
};

export function ViewContainer({
  title,
  subtitle,
  items,
  loading,
  parentId,
  defaultLayout = 'list',
}: {
  title: string;
  subtitle?: string;
  items: ItemDTO[];
  loading?: boolean;
  parentId?: string;
  defaultLayout?: ViewLayout;
}) {
  const [layout, setLayout] = useState<ViewLayout>(defaultLayout);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1040px] flex-1 flex-col px-12 py-10">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5">
          {(['list', 'grid', 'timeline', 'tagboard'] as const).map((l) => {
            const Icon = ICON[l];
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
      </div>

      <div className="min-h-0 flex-1">
        {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nothing here yet.
          </div>
        )}
        {!loading && items.length > 0 && (
          <>
            {layout === 'list' && <ListView items={items} parentId={parentId} />}
            {layout === 'grid' && <GridView items={items} />}
            {layout === 'timeline' && <TimelineView items={items} />}
            {layout === 'tagboard' && <TagboardView items={items} />}
          </>
        )}
      </div>
    </div>
  );
}
