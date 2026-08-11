import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, File as FileIcon, Folder, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDocumentTitle } from '../lib/documentTitle.js';
import { http } from '../lib/http.js';

export function DriveTrashPage() {
  const qc = useQueryClient();
  useDocumentTitle('Drive trash');
  const trash = useQuery({
    queryKey: ['drive-trash'],
    queryFn: http.driveTrash,
    staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['drive-trash'] });
    qc.invalidateQueries({ queryKey: ['drive-tree'] });
    qc.invalidateQueries({ queryKey: ['items'] });
  };

  const restore = useMutation({
    mutationFn: (fileId: string) => http.untrashDriveFile(fileId),
    onSuccess: () => {
      invalidate();
      toast.success('Restored from Drive trash');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const purge = useMutation({
    mutationFn: (fileId: string) => http.permanentlyDeleteDriveFile(fileId),
    onSuccess: () => {
      invalidate();
      toast.success('Deleted forever');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1040px] flex-1 flex-col px-12 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Drive trash</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Files you trashed from NotDrive. Google permanently deletes them after 30 days.
        </p>
      </div>

      {trash.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {!trash.isLoading && trash.data?.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nothing in the trash.
        </div>
      )}

      <ul className="flex flex-col divide-y divide-border/60">
        {trash.data?.map((f) => (
          <li key={f.id} className="group flex items-center gap-3 py-2">
            {f.is_folder ? (
              <Folder className="size-4 shrink-0 text-muted-foreground/80" />
            ) : (
              <FileIcon className="size-4 shrink-0 text-muted-foreground/70" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{f.name}</div>
              {f.modified_time && (
                <div className="text-[11px] text-muted-foreground">
                  Modified {new Date(f.modified_time).toLocaleString()}
                </div>
              )}
            </div>
            <a
              href={`https://drive.google.com/file/d/${f.id}/view`}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-muted group-hover:opacity-100"
              title="Open in Drive"
            >
              <ExternalLink className="size-3.5" />
            </a>
            <button
              type="button"
              onClick={() => restore.mutate(f.id)}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              <RotateCcw className="size-3" /> Restore
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(`PERMANENTLY delete "${f.name}"? Irreversible.`)) purge.mutate(f.id);
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-3" /> Delete forever
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
