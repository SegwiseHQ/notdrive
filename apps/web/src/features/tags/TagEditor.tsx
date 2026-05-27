import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { http } from '../../lib/http.js';

export function TagEditor({ itemId, tagIds }: { itemId: string; tagIds: string[] }) {
  const qc = useQueryClient();
  const tagsQuery = useQuery({ queryKey: ['tags'], queryFn: http.listTags });
  const [open, setOpen] = useState(false);

  const attach = useMutation({
    mutationFn: (tagId: string) => http.attachTag(itemId, tagId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['item', itemId] }),
  });
  const detach = useMutation({
    mutationFn: (tagId: string) => http.detachTag(itemId, tagId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['item', itemId] }),
  });

  const tagMap = new Map((tagsQuery.data ?? []).map((t) => [t.id, t]));
  const attached = tagIds.map((id) => tagMap.get(id)).filter(Boolean);
  const available = (tagsQuery.data ?? []).filter((t) => !tagIds.includes(t.id));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {attached.map((t) => (
        <span
          key={t!.id}
          className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
        >
          <span
            className="size-1.5 rounded-full"
            style={{
              backgroundColor:
                ({
                  gray: '#9ca3af',
                  red: '#f87171',
                  orange: '#fb923c',
                  yellow: '#facc15',
                  green: '#4ade80',
                  teal: '#2dd4bf',
                  blue: '#60a5fa',
                  indigo: '#818cf8',
                  purple: '#c084fc',
                  pink: '#f472b6',
                } as Record<string, string>)[t!.color] ?? '#9ca3af',
            }}
          />
          {t!.name}
          <button
            onClick={() => detach.mutate(t!.id)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {available.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          >
            <Plus className="size-3" /> tag
          </button>
          {open && (
            <div className="absolute right-0 top-full z-40 mt-1 w-48 rounded-md border border-border bg-card p-1 shadow-md">
              {available.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    attach.mutate(t.id);
                    setOpen(false);
                  }}
                  className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
