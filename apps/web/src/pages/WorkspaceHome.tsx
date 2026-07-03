import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { http } from '../lib/http.js';
import { ViewContainer } from '../views/ViewContainer.js';

export function WorkspaceHome() {
  const { wsId = '' } = useParams();
  const rootQuery = useQuery({
    queryKey: ['items', wsId, 'root'],
    queryFn: () => http.listItems({ root: true, archived: false }),
  });

  return (
    <ViewContainer
      title="All pages"
      subtitle="Top-level items in this workspace"
      items={rootQuery.data ?? []}
      loading={rootQuery.isLoading}
      defaultLayout="list"
    />
  );
}
