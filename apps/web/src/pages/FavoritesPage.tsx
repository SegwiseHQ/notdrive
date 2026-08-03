import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { http } from '../lib/http.js';
import { ViewContainer } from '../views/ViewContainer.js';

export function FavoritesPage() {
  const { wsId = '' } = useParams();
  const favorites = useQuery({
    queryKey: ['items', wsId, 'favorites-page'],
    queryFn: () => http.listItems({ favorite: true, archived: false }),
  });
  return (
    <ViewContainer
      title="Favorites"
      subtitle="Starred items"
      items={favorites.data ?? []}
      loading={favorites.isLoading}
      defaultLayout="list"
    />
  );
}
