import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { http } from '../lib/http.js';
import { ViewContainer } from '../views/ViewContainer.js';

export function ViewPage() {
  const { wsId = '', viewId = '' } = useParams();
  const views = useQuery({ queryKey: ['views', wsId], queryFn: http.listViews });
  const view = useMemo(() => views.data?.find((v) => v.id === viewId), [views.data, viewId]);

  const results = useQuery({
    queryKey: ['search', wsId, view?.query],
    queryFn: () => (view?.query ? http.search(view.query) : Promise.resolve([])),
    enabled: !!view,
  });

  if (!view) return <div className="p-8 text-muted-foreground">Loading view…</div>;
  return (
    <ViewContainer
      title={view.name}
      subtitle={view.query || 'No query'}
      items={results.data ?? []}
      loading={results.isLoading}
      defaultLayout={view.layout}
    />
  );
}
