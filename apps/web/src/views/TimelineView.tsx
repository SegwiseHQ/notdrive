import type { ItemDTO } from '@notdrive/shared';
import { Link, useParams } from 'react-router-dom';

const DAY = 86_400_000;
function bucketOf(ms: number, now: number): string {
  const deltaDays = Math.floor((now - ms) / DAY);
  if (deltaDays <= 0) return 'Today';
  if (deltaDays === 1) return 'Yesterday';
  if (deltaDays <= 7) return 'This week';
  if (deltaDays <= 30) return 'This month';
  return 'Earlier';
}

const ORDER = ['Today', 'Yesterday', 'This week', 'This month', 'Earlier'];

export function TimelineView({ items }: { items: ItemDTO[] }) {
  const { wsId = '' } = useParams();
  const now = Date.now();
  const groups = new Map<string, ItemDTO[]>();
  for (const it of items) {
    const ts = it.drive?.modified_time ?? it.updated_at;
    const key = bucketOf(ts, now);
    const arr = groups.get(key) ?? [];
    arr.push(it);
    groups.set(key, arr);
  }

  return (
    <div className="flex flex-col gap-6">
      {ORDER.filter((k) => groups.get(k)?.length).map((k) => (
        <section key={k}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {k}
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {groups.get(k)?.map((it) => (
              <li key={it.id}>
                <Link to={`/w/${wsId}/i/${it.id}`} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{it.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(it.drive?.modified_time ?? it.updated_at).toLocaleString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
