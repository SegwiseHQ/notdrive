import type { ItemDTO } from '@notdrive/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { http } from '../lib/http.js';

export function TagboardView({ items }: { items: ItemDTO[] }) {
  const { wsId = '' } = useParams();
  const tagsQuery = useQuery({ queryKey: ['tags', wsId], queryFn: http.listTags });
  const tags = tagsQuery.data ?? [];

  const byTag = new Map<string, ItemDTO[]>();
  const untagged: ItemDTO[] = [];
  for (const it of items) {
    if (it.tag_ids.length === 0) untagged.push(it);
    for (const tid of it.tag_ids) {
      const arr = byTag.get(tid) ?? [];
      arr.push(it);
      byTag.set(tid, arr);
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {tags.map((t) => (
        <Column key={t.id} title={`# ${t.name}`} items={byTag.get(t.id) ?? []} wsId={wsId} />
      ))}
      <Column title="Untagged" items={untagged} wsId={wsId} />
    </div>
  );
}

function Column({ title, items, wsId }: { title: string; items: ItemDTO[]; wsId: string }) {
  return (
    <div className="flex w-64 shrink-0 flex-col rounded-md bg-muted/40 p-2">
      <div className="mb-2 flex items-center justify-between text-xs font-medium">
        <span>{title}</span>
        <span className="text-muted-foreground">{items.length}</span>
      </div>
      <div className="flex flex-col gap-1">
        {items.map((it) => (
          <Link
            key={it.id}
            to={`/w/${wsId}/i/${it.id}`}
            className="truncate rounded border border-border bg-card px-2 py-1 text-sm hover:border-ring"
          >
            {it.title}
          </Link>
        ))}
      </div>
    </div>
  );
}
