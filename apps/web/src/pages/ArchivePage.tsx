import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { useDocumentTitle } from '../lib/documentTitle.js';
import { http } from '../lib/http.js';

export function ArchivePage() {
  const { wsId = '' } = useParams();
  const qc = useQueryClient();
  useDocumentTitle('Archive');
  const archived = useQuery({
    queryKey: ['items', wsId, 'archived'],
    queryFn: () => http.listItems({ archived: true }),
  });
  const restore = useMutation({
    mutationFn: (id: string) => http.restoreItem(id),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success('Restored');
    },
  });
  const purge = useMutation({
    mutationFn: (id: string) => http.purgeItem(id),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success('Permanently deleted');
    },
  });

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Archive</h1>
          <p className="text-sm text-muted-foreground">
            Archived items are permanently deleted after 30 days.
          </p>
        </div>
      </div>
      {archived.isLoading && <div className="text-muted-foreground">Loading…</div>}
      <ul className="flex flex-col divide-y divide-border">
        {archived.data?.map((it) => (
          <li key={it.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{it.title}</div>
              <div className="text-xs text-muted-foreground">
                {it.archived_at ? new Date(it.archived_at).toLocaleString() : ''}
                {it.drive?.name ? ` · ${it.drive.name}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => restore.mutate(it.id)}
              className="rounded-md px-2 py-1 text-xs hover:bg-accent"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Permanently delete "${it.title}"? This cannot be undone.`)) {
                  purge.mutate(it.id);
                }
              }}
              className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
            >
              Delete forever
            </button>
          </li>
        ))}
        {archived.data?.length === 0 && (
          <li className="py-8 text-center text-sm text-muted-foreground">Archive is empty.</li>
        )}
      </ul>
    </div>
  );
}
