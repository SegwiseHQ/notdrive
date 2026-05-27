import type { ItemDTO } from '@notdrive/shared';
import { File as FileIcon, FileText } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useSelection } from '../lib/store.js';

export function ListView({ items }: { items: ItemDTO[]; parentId?: string }) {
  const { wsId = '' } = useParams();
  const select = useSelection((s) => s.select);
  return (
    <ul className="flex flex-col">
      {items.map((it) => (
        <li key={it.id}>
          <Link
            to={`/w/${wsId}/i/${it.id}`}
            onClick={() => select(it.id)}
            className="group flex items-center gap-3 rounded-md px-2 py-2 transition hover:bg-muted/70"
          >
            {it.type === 'file' ? (
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {it.title || 'Untitled'}
              {it.drive?.name && (
                <span className="ml-2 text-xs text-muted-foreground">· {it.drive.name}</span>
              )}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {new Date(it.updated_at).toLocaleDateString()}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
