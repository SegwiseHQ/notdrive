import * as Dialog from '@radix-ui/react-dialog';
import type { DriveRoleLiteral } from '@notdrive/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Globe, Link as LinkIcon, Lock, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { http } from '../../lib/http.js';

type Role = DriveRoleLiteral;

export function ShareDialog({
  fileId,
  fileName,
  open,
  onOpenChange,
}: {
  fileId: string;
  fileName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const permsKey = ['permissions', fileId] as const;
  const perms = useQuery({
    queryKey: permsKey,
    queryFn: () => http.listPermissions(fileId),
    enabled: open,
  });

  const linkPerm = perms.data?.find((p) => p.type === 'anyone');
  const people = (perms.data ?? []).filter((p) => p.type !== 'anyone' && !p.deleted);

  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('reader');

  const invalidate = () => qc.invalidateQueries({ queryKey: permsKey });

  const addPerson = useMutation({
    mutationFn: () =>
      http.addPermission(fileId, {
        type: 'user',
        role: inviteRole,
        email,
        send_notification_email: true,
      }),
    onSuccess: () => {
      setEmail('');
      invalidate();
      toast.success('Access granted');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const changeRole = useMutation({
    mutationFn: ({ pid, role }: { pid: string; role: Role }) =>
      http.updatePermission(fileId, pid, role),
    onSuccess: invalidate,
  });

  const revoke = useMutation({
    mutationFn: (pid: string) => http.removePermission(fileId, pid),
    onSuccess: invalidate,
  });

  const enableLink = useMutation({
    mutationFn: (role: Role) => http.enableLinkShare(fileId, role),
    onSuccess: ({ web_view_link }) => {
      invalidate();
      if (web_view_link) {
        void navigator.clipboard.writeText(web_view_link).catch(() => {});
        toast.success('Link copied to clipboard');
      }
    },
  });
  const disableLink = useMutation({
    mutationFn: () => http.disableLinkShare(fileId),
    onSuccess: () => {
      invalidate();
      toast.success('Link sharing off');
    },
  });

  const copyLink = () => enableLink.mutate((linkPerm?.role as Role) ?? 'reader');

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-24 z-50 w-[560px] max-w-[95vw] -translate-x-1/2 rounded-lg border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-sm font-semibold">Share "{fileName}"</Dialog.Title>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Managed via Google Drive's own sharing model.
              </p>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 text-muted-foreground hover:bg-muted">
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex items-end gap-2 border-b border-border px-4 py-3">
            <div className="flex flex-1 flex-col">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                Add by email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="reader">Viewer</option>
              <option value="commenter">Commenter</option>
              <option value="writer">Editor</option>
            </select>
            <button
              onClick={() => email && addPerson.mutate()}
              disabled={!email}
              className="flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="size-3" /> Invite
            </button>
          </div>

          <div className="max-h-60 overflow-auto px-4 py-3">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground/80">
              People with access
            </div>
            {perms.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {!perms.isLoading && people.length === 0 && (
              <div className="text-sm text-muted-foreground">Only you.</div>
            )}
            <ul className="flex flex-col divide-y divide-border/60">
              {people.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <img
                    src={p.photo_link ?? ''}
                    alt=""
                    className="size-7 rounded-full bg-muted"
                    onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      {p.display_name ?? p.email ?? p.domain ?? p.id}
                    </div>
                    {p.email && p.display_name && (
                      <div className="truncate text-[11px] text-muted-foreground">{p.email}</div>
                    )}
                  </div>
                  {p.role === 'owner' || p.role === 'organizer' ? (
                    <span className="rounded-md bg-muted px-2 py-1 text-xs">{p.role}</span>
                  ) : (
                    <select
                      value={p.role}
                      onChange={(e) =>
                        changeRole.mutate({ pid: p.id, role: e.target.value as Role })
                      }
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                    >
                      <option value="reader">Viewer</option>
                      <option value="commenter">Commenter</option>
                      <option value="writer">Editor</option>
                    </select>
                  )}
                  {p.role !== 'owner' && p.role !== 'organizer' && (
                    <button
                      onClick={() => revoke.mutate(p.id)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Remove access"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
            <div className="flex items-center gap-2">
              {linkPerm ? (
                <Globe className="size-4 text-muted-foreground" />
              ) : (
                <Lock className="size-4 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  {linkPerm ? 'Anyone with the link' : 'Link sharing off'}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {linkPerm
                    ? `Anyone with this URL can ${linkPerm.role === 'writer' ? 'edit' : linkPerm.role === 'commenter' ? 'comment' : 'view'}`
                    : 'Only people you invite can open this file'}
                </div>
              </div>
              {linkPerm ? (
                <>
                  <select
                    value={linkPerm.role}
                    onChange={(e) => enableLink.mutate(e.target.value as Role)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="reader">Viewer</option>
                    <option value="commenter">Commenter</option>
                    <option value="writer">Editor</option>
                  </select>
                  <button
                    onClick={() => disableLink.mutate()}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    Turn off
                  </button>
                </>
              ) : (
                <button
                  onClick={() => enableLink.mutate('reader')}
                  className="flex items-center gap-1 rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background hover:opacity-90"
                >
                  <LinkIcon className="size-3" /> Enable
                </button>
              )}
            </div>
            <button
              onClick={copyLink}
              className="flex items-center justify-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
            >
              <Copy className="size-3" /> Copy share link
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
