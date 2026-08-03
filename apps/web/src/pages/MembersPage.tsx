import type { AutoShareMode, DriveRoleLiteral } from '@notdrive/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { http } from '../lib/http.js';

export function MembersPage() {
  const { wsId = '' } = useParams();
  const qc = useQueryClient();
  const meQuery = useQuery({ queryKey: ['me'], queryFn: http.me });
  const membersQuery = useQuery({
    queryKey: ['members', wsId],
    queryFn: () => http.members(wsId),
  });
  const myId = meQuery.data?.user.id;
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () => http.invite(wsId, email, role),
    onSuccess: (res) => {
      const url = `${window.location.origin}/invites/accept?token=${res.token}`;
      setLastInviteUrl(url);
      void navigator.clipboard.writeText(url).catch(() => {});
      toast.success('Invite link copied to clipboard');
      setEmail('');
    },
  });
  const updateRole = useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: string }) => http.patchMember(wsId, uid, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', wsId] }),
  });
  const remove = useMutation({
    mutationFn: (uid: string) => http.removeMember(wsId, uid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', wsId] }),
  });

  const currentWs = meQuery.data?.workspaces.find((w) => w.id === wsId);
  const canManage = currentWs && (currentWs.role === 'owner' || currentWs.role === 'admin');
  const patchWs = useMutation({
    mutationFn: (patch: {
      auto_share_mode?: AutoShareMode;
      auto_share_role?: DriveRoleLiteral;
    }) => http.patchWorkspace(wsId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Settings updated');
    },
  });

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">People</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Invite people to see and edit your NotDrive pages.
      </p>

      {currentWs && (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <div className="min-w-0">
            <div className="text-sm font-medium">Auto-share Drive files with invited people</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Decide how aggressively NotDrive mirrors Drive permissions when files are linked or
              when someone new joins. Disabling does not revoke previously granted access.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label htmlFor="auto-share-mode" className="text-muted-foreground">
              Mode
            </label>
            <select
              id="auto-share-mode"
              value={currentWs.auto_share_mode}
              disabled={!canManage}
              onChange={(e) => patchWs.mutate({ auto_share_mode: e.target.value as AutoShareMode })}
              className="rounded-md border border-border bg-background px-2 py-1 disabled:opacity-50"
            >
              <option value="off">Off — never auto-share</option>
              <option value="domain">Only files already shared org-wide / via link</option>
              <option value="all">All linked files</option>
            </select>
            <label htmlFor="auto-share-role" className="ml-3 text-muted-foreground">
              Role granted
            </label>
            <select
              id="auto-share-role"
              value={currentWs.auto_share_role}
              disabled={!canManage || currentWs.auto_share_mode === 'off'}
              onChange={(e) =>
                patchWs.mutate({
                  auto_share_role: e.target.value as DriveRoleLiteral,
                })
              }
              className="rounded-md border border-border bg-background px-2 py-1 disabled:opacity-50"
            >
              <option value="reader">Viewer</option>
              <option value="commenter">Commenter</option>
              <option value="writer">Editor</option>
            </select>
          </div>
          {currentWs.auto_share_mode === 'domain' && (
            <p className="text-[11px] text-muted-foreground">
              NotDrive checks each file's existing permissions. If it has a domain-wide share or an
              "anyone with the link" permission, the file is shared with everyone in NotDrive. Files
              shared narrowly with specific people are left untouched.
            </p>
          )}
        </div>
      )}

      <div className="mb-6 flex items-end gap-2">
        <div className="flex flex-col">
          <label htmlFor="invite-email" className="text-xs text-muted-foreground">
            Email
          </label>
          <input
            id="invite-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="teammate@example.com"
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor="invite-role" className="text-xs text-muted-foreground">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'admin' | 'member' | 'viewer')}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="viewer">viewer</option>
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => email && invite.mutate()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
        >
          Invite
        </button>
      </div>

      {lastInviteUrl && (
        <div className="mb-6 flex flex-col gap-1 rounded-md border border-border bg-muted/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
            Share this link with the invitee
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={lastInviteUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 truncate rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(lastInviteUrl);
                toast.success('Copied');
              }}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              Copy
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            They must be signed in with the invited email when they open this link. Expires in 7
            days.
          </p>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-border">
        {membersQuery.data?.map((m) => (
          <li key={m.user_id} className="flex items-center gap-3 py-2">
            <img src={m.avatar_url ?? ''} className="size-8 rounded-full bg-muted" alt="" />
            <div className="min-w-0 flex-1">
              <div className="truncate">{m.name}</div>
              <div className="text-xs text-muted-foreground">{m.email}</div>
            </div>
            {m.user_id === myId ? (
              <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                {m.role} · you
              </span>
            ) : (
              <>
                <select
                  value={m.role}
                  onChange={(e) => updateRole.mutate({ uid: m.user_id, role: e.target.value })}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="viewer">viewer</option>
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                  <option value="owner">owner</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Remove ${m.email}?`)) remove.mutate(m.user_id);
                  }}
                  className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                >
                  Remove
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
