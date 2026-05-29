import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, MoreHorizontal, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ShareDialog } from '../features/share/ShareDialog.js';
import { http } from '../lib/http.js';

/**
 * Center-view preview of a raw Drive file (one that isn't linked as a
 * NotDrive page). Click "Add to pages" to promote it, "Share" to manage
 * permissions, or "Edit in Google" to open the real editor.
 */
export function DriveFilePage() {
  const { wsId = '', fileId = '' } = useParams();
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);

  const fileQuery = useQuery({
    queryKey: ['drive-file', fileId],
    queryFn: () => http.driveFile(fileId),
    enabled: !!fileId,
  });

  const file = fileQuery.data;
  const webViewLink = file?.web_view_link ?? null;

  return (
    <div className="mx-auto flex min-h-0 w-full flex-1 flex-col px-8 py-8">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">Drive file</div>
          <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight">
            {file?.name ?? 'Loading…'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            <Share2 className="size-3" /> Share
          </button>
          {webViewLink && (
            <a
              href={webViewLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
            >
              <ExternalLink className="size-3" /> Edit in Google
            </a>
          )}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted">
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                className="z-50 w-56 rounded-md border border-border bg-card p-1 shadow-lg"
              >
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/10"
                  onSelect={async () => {
                    if (!confirm('Move this Drive file to trash? Recoverable for 30 days.'))
                      return;
                    try {
                      await http.trashDriveFile(fileId);
                      toast.success('Moved to Drive trash');
                      navigate(`/w/${wsId}/drive`);
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" /> Move to Drive trash
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/10"
                  onSelect={async () => {
                    if (
                      !confirm(
                        'PERMANENTLY delete this Drive file? Irreversible. Only the file owner can do this.',
                      )
                    )
                      return;
                    try {
                      await http.permanentlyDeleteDriveFile(fileId);
                      toast.success('File deleted forever');
                      navigate(`/w/${wsId}/drive`);
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" /> Delete forever
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      <div
        className="group relative overflow-hidden rounded-lg border border-border bg-muted/30"
        style={{ resize: 'vertical', height: '80vh', minHeight: '40vh' }}
      >
        <iframe
          key={fileId}
          title={file?.name ?? ''}
          src={`https://drive.google.com/file/d/${fileId}/preview`}
          className="h-full w-full border-0"
          allow="autoplay"
        />
        {webViewLink && (
          <a
            href={webViewLink}
            target="_blank"
            rel="noreferrer"
            className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-foreground/90 px-3 py-1 text-xs font-medium text-background opacity-0 shadow-lg backdrop-blur transition group-hover:opacity-100"
          >
            <ExternalLink className="size-3" /> Open to edit
          </a>
        )}
      </div>

      <ShareDialog
        fileId={fileId}
        fileName={file?.name ?? ''}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </div>
  );
}
