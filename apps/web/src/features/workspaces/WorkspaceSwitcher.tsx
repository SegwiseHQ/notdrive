import type { MeDTO } from '@notdrive/shared';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useWorkspace } from '../../lib/store.js';

/**
 * Displays the active context. If the user only has one (the common case),
 * renders as a static label — no popover, no switcher chrome. Only opens into
 * a chooser when they belong to multiple (e.g., joined via invite).
 */
export function WorkspaceSwitcher({ me }: { me: MeDTO }) {
  const { wsId: current } = useParams();
  const navigate = useNavigate();
  const setActiveWs = useWorkspace((s) => s.setActiveWs);
  const [open, setOpen] = useState(false);

  const active = me.workspaces.find((w) => w.id === current);
  const hasMultiple = me.workspaces.length > 1;
  // In single-workspace mode (the typical case after we hid the workspace
  // concept), label the header with the user's own name rather than the
  // auto-created workspace name — matches the Drive-style mental model.
  const soloLabel = (me.user.name ?? me.user.email ?? 'NotDrive').trim();
  const activeName = hasMultiple ? (active?.name ?? 'NotDrive') : soloLabel;

  if (!hasMultiple) {
    return (
      <div className="flex w-full items-center gap-2 px-1.5 py-1">
        <img src="/icon.png" alt="" className="size-5 rounded" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{activeName}</span>
      </div>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition hover:bg-muted"
        >
          <img src="/icon.png" alt="" className="size-5 rounded" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{activeName}</span>
          <ChevronsUpDown className="size-3 text-muted-foreground/70" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          className="z-50 w-64 rounded-md border border-border bg-card p-1 shadow-md"
        >
          {me.workspaces.map((w) => (
            <button
              type="button"
              key={w.id}
              onClick={() => {
                setActiveWs(w.id);
                navigate(`/w/${w.id}`);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {current === w.id && <Check className="size-3.5" />}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
