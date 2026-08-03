import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { http } from '../../lib/http.js';

const PRESETS = [
  { name: 'All PDFs', query: 'mime:pdf', layout: 'grid' },
  { name: 'Last 7 days', query: 'modified:<7d', layout: 'timeline' },
  { name: 'Favorites', query: 'is:favorite', layout: 'list' },
];

export function ViewsList({ wsId }: { wsId: string }) {
  const qc = useQueryClient();
  const viewsQuery = useQuery({ queryKey: ['views', wsId], queryFn: http.listViews });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const create = useMutation({
    mutationFn: (v: { name: string; query: string; layout: string }) => http.createView(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['views', wsId] });
      setCreating(false);
      setName('');
      setQuery('');
    },
  });
  const views = viewsQuery.data ?? [];
  const missingPresets = PRESETS.filter((p) => !views.some((v) => v.name === p.name));

  return (
    <div className="flex flex-col">
      {missingPresets.length > 0 && (
        <div className="px-2 py-1 text-xs text-muted-foreground">
          {missingPresets.map((p) => (
            <button
              type="button"
              key={p.name}
              onClick={() => create.mutate(p)}
              className="mr-1 rounded-md px-1.5 py-0.5 text-[11px] hover:bg-accent"
              title="Seed preset view"
            >
              + {p.name}
            </button>
          ))}
        </div>
      )}
      {views.map((v) => (
        <Link
          key={v.id}
          to={`/w/${wsId}/view/${v.id}`}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent"
        >
          <span className="text-muted-foreground">◇</span>
          <span className="min-w-0 flex-1 truncate">{v.name}</span>
          <span className="text-[11px] text-muted-foreground">{v.layout}</span>
        </Link>
      ))}
      {creating ? (
        <div className="flex flex-col gap-1 px-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Query, e.g. tag:design modified:<30d"
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs"
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => name && create.mutate({ name, query, layout: 'list' })}
              className="flex-1 rounded-md bg-primary px-2 py-0.5 text-xs text-primary-foreground"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          <Plus className="size-3" /> New view
        </button>
      )}
    </div>
  );
}
