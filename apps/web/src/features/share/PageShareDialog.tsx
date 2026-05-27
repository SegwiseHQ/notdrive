import * as Dialog from '@radix-ui/react-dialog';
import { Copy, Users, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

/**
 * Sharing surface for native (non-Drive-linked) pages. They have no per-page
 * ACL — access is workspace-membership-only. This dialog explains that and
 * gives one-click affordances: copy the deep-link URL, or jump to Members
 * to invite someone to the whole workspace.
 */
export function PageShareDialog({
  itemId,
  open,
  onOpenChange,
}: {
  itemId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const { wsId = '' } = useParams();
  const pageUrl = `${window.location.origin}/w/${wsId}/i/${itemId}`;

  const copyUrl = () => {
    void navigator.clipboard.writeText(pageUrl).catch(() => {});
    toast.success('Page link copied');
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-32 z-50 w-[480px] max-w-[95vw] -translate-x-1/2 rounded-lg border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-semibold">Share this page</Dialog.Title>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Anyone you've invited to NotDrive can already open this page. Others need an
                invite first.
              </p>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 text-muted-foreground hover:bg-muted">
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
              Page link
            </div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={pageUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 truncate rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
              />
              <button
                onClick={copyUrl}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
              >
                <Copy className="size-3" /> Copy
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Opens for anyone you've invited. Others see the login page.
            </p>
          </div>

          <div className="flex items-center gap-2 border-t border-border px-4 py-3">
            <Users className="size-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm">Invite someone new</div>
              <div className="text-[11px] text-muted-foreground">
                Gives them access to all your NotDrive pages.
              </div>
            </div>
            <button
              onClick={() => {
                onOpenChange(false);
                navigate(`/w/${wsId}/settings/members`);
              }}
              className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background hover:opacity-90"
            >
              Open members
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
