import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TAG_COLORS } from '@notdrive/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { http } from '../../lib/http.js';

const colorClass: Record<string, string> = {
  gray: 'bg-gray-400',
  red: 'bg-red-400',
  orange: 'bg-orange-400',
  yellow: 'bg-yellow-400',
  green: 'bg-green-400',
  teal: 'bg-teal-400',
  blue: 'bg-blue-400',
  indigo: 'bg-indigo-400',
  purple: 'bg-purple-400',
  pink: 'bg-pink-400',
};

export function TagList({ wsId }: { wsId: string }) {
  const qc = useQueryClient();
  const tagsQuery = useQuery({ queryKey: ['tags', wsId], queryFn: http.listTags });
  const [name, setName] = useState('');
  const [color, setColor] = useState<(typeof TAG_COLORS)[number]>('gray');
  const create = useMutation({
    mutationFn: () => http.createTag(name, color),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags', wsId] });
      setName('');
    },
  });

  return (
    <div className="flex flex-col">
      {tagsQuery.data?.map((t) => (
        <Link
          key={t.id}
          to={`/w/${wsId}/tags/${t.id}`}
          className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent"
        >
          <span className={`size-2 rounded-full ${colorClass[t.color] ?? 'bg-gray-400'}`} />
          <span className="min-w-0 flex-1 truncate">{t.name}</span>
        </Link>
      ))}
      <div className="mt-1 flex items-center gap-1 px-1">
        <select
          value={color}
          onChange={(e) => setColor(e.target.value as (typeof TAG_COLORS)[number])}
          className="rounded-md border border-border bg-background px-1 py-0.5 text-xs"
        >
          {TAG_COLORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="new tag"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs"
        />
        <button
          onClick={() => name && create.mutate()}
          className="rounded-md p-0.5 text-muted-foreground hover:bg-accent"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
