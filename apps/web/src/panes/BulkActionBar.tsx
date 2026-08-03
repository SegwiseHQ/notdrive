import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, X } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { http } from '../lib/http.js';
import { useBulk } from '../lib/store.js';

/**
 * Floating bar at the bottom of the viewport, visible only when there's a
 * non-empty bulk selection. Currently used for Drive-file bulk actions
 * (trash / permanent delete). The store also has a `pages` selection set
 * ready for a future page-bulk-archive action if wanted.
 */
export function BulkActionBar() {
  const driveIds = useBulk((s) => s.drive);
  const pageIds = useBulk((s) => s.pages);
  const clear = useBulk((s) => s.clear);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { wsId = '' } = useParams();

  /** Bail out of /drive/file/:id if the current preview just got destroyed. */
  const routeAwayIfViewingTrashed = (ids: string[]) => {
    const m = /\/drive\/file\/([^/?#]+)/.exec(location.pathname);
    if (m && ids.includes(m[1] ?? '')) navigate(`/w/${wsId}/drive`);
  };

  const trashAll = useMutation({
    mutationFn: async () => {
      const ids = [...driveIds];
      await Promise.allSettled(ids.map((id) => http.trashDriveFile(id)));
      return ids;
    },
    onSuccess: async (ids) => {
      await http.driveSync().catch(() => {});
      qc.invalidateQueries({ queryKey: ['drive-tree'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      routeAwayIfViewingTrashed(ids);
      toast.success(`Moved ${ids.length} file${ids.length === 1 ? '' : 's'} to Drive trash`);
      clear();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteAll = useMutation({
    mutationFn: async () => {
      const ids = [...driveIds];
      const results = await Promise.allSettled(
        ids.map((id) => http.permanentlyDeleteDriveFile(id)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      return { ids, failed };
    },
    onSuccess: async ({ ids, failed }) => {
      await http.driveSync().catch(() => {});
      qc.invalidateQueries({ queryKey: ['drive-tree'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      routeAwayIfViewingTrashed(ids);
      const total = ids.length;
      if (failed === 0) {
        toast.success(`Deleted ${total} file${total === 1 ? '' : 's'} forever`);
      } else {
        toast.warning(
          `Deleted ${total - failed} of ${total}. ${failed} failed (you're not the file owner).`,
        );
      }
      clear();
    },
  });

  const count = driveIds.size || pageIds.size;
  if (count === 0) return null;
  const isDriveMode = driveIds.size > 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-xl">
        <span className="px-2 text-sm font-medium">{count} selected</span>
        <span className="h-4 w-px bg-border" />
        {isDriveMode && (
          <>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Move ${count} Drive file${count === 1 ? '' : 's'} to trash?`))
                  trashAll.mutate();
              }}
              disabled={trashAll.isPending}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              <Trash2 className="size-3" /> Move to trash
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    `PERMANENTLY delete ${count} file${count === 1 ? '' : 's'}? Irreversible. Only files you own will be deleted.`,
                  )
                )
                  deleteAll.mutate();
              }}
              disabled={deleteAll.isPending}
              className="flex items-center gap-1 rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Trash2 className="size-3" /> Delete forever
            </button>
          </>
        )}
        <span className="h-4 w-px bg-border" />
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          <X className="size-3" /> Cancel
        </button>
      </div>
    </div>
  );
}
