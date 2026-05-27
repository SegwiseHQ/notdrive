import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { TagList } from '../features/tags/TagList.js';
import { http } from '../lib/http.js';

export function TagsIndexPage() {
  const { wsId = '' } = useParams();
  const tags = useQuery({ queryKey: ['tags', wsId], queryFn: http.listTags });

  return (
    <div className="mx-auto w-full max-w-[880px] px-12 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Tags</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tags for your pages.</p>

      <div className="mt-8 grid grid-cols-2 gap-2">
        {tags.data?.map((t) => (
          <Link
            key={t.id}
            to={`/w/${wsId}/tags/${t.id}`}
            className="flex items-center gap-2 rounded-md px-3 py-2 transition hover:bg-muted/70"
          >
            <span className={`size-2 rounded-full bg-${t.color}-400`} />
            <span className="truncate">{t.name}</span>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground/80">Create tag</div>
        <div className="rounded-lg border border-border bg-card p-2">
          <TagList wsId={wsId} />
        </div>
      </div>
    </div>
  );
}
