import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { http } from '../lib/http.js';
import { ViewContainer } from '../views/ViewContainer.js';

export function TagPage() {
  const { wsId = '', tagId = '' } = useParams();
  const tags = useQuery({ queryKey: ['tags', wsId], queryFn: http.listTags });
  const tag = useMemo(() => tags.data?.find((t) => t.id === tagId), [tags.data, tagId]);

  const results = useQuery({
    queryKey: ['search', wsId, `tag:${tag?.name ?? ''}`],
    queryFn: () => (tag ? http.search(`tag:${tag.name}`) : Promise.resolve([])),
    enabled: !!tag,
  });

  if (!tag) return <div className="p-8 text-muted-foreground">Loading tag…</div>;
  return (
    <ViewContainer
      title={`# ${tag.name}`}
      subtitle="Items with this tag"
      items={results.data ?? []}
      loading={results.isLoading}
      defaultLayout="list"
    />
  );
}
