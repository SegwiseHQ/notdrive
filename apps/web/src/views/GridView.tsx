import type { ItemDTO } from '@notdrive/shared';
import { Link, useParams } from 'react-router-dom';

export function GridView({ items }: { items: ItemDTO[] }) {
  const { wsId = '' } = useParams();
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {items.map((it) => (
        <Link
          key={it.id}
          to={`/w/${wsId}/i/${it.id}`}
          className="flex flex-col overflow-hidden rounded-md border border-border bg-card hover:border-ring"
        >
          <div className="flex aspect-video items-center justify-center bg-muted">
            {it.drive?.thumbnail_link ? (
              <img
                src={it.drive.thumbnail_link}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-3xl">📄</span>
            )}
          </div>
          <div className="min-w-0 p-2">
            <div className="truncate text-sm font-medium">{it.title}</div>
            {it.drive?.mime_type && (
              <div className="truncate text-xs text-muted-foreground">{it.drive.mime_type}</div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
