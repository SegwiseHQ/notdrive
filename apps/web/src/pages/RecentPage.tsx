import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { http } from '../lib/http.js';

export function RecentPage() {
  const { wsId = '' } = useParams();
  const recent = useQuery({ queryKey: ['recent', wsId], queryFn: http.recent });
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Recent</h1>
      <p className="mb-4 text-sm text-muted-foreground">Items you've touched recently.</p>
      <ul className="flex flex-col divide-y divide-border">
        {recent.data?.map((r) => (
          <li key={r.item.id + r.at} className="py-2">
            <Link to={`/w/${wsId}/i/${r.item.id}`} className="group flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium group-hover:underline">{r.item.title}</div>
                <div className="text-xs text-muted-foreground">
                  {r.kind} · {new Date(r.at).toLocaleString()}
                </div>
              </div>
            </Link>
          </li>
        ))}
        {recent.data?.length === 0 && (
          <li className="py-8 text-center text-sm text-muted-foreground">No activity yet.</li>
        )}
      </ul>
    </div>
  );
}
