import type { MeDTO } from '@notdrive/shared';
import type { DarkMode } from '@notdrive/shared';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Clock,
  HardDrive,
  LayoutGrid,
  Monitor,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Star,
  Sun,
  Tag as TagIcon,
  Trash2,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CreateDriveMenu } from '../features/drive-picker/CreateDriveMenu.js';
import { NotificationBell } from '../features/notifications/NotificationBell.js';
import { DriveTreePanel } from '../features/tree/DriveTreePanel.js';
import { TreePanel } from '../features/tree/TreePanel.js';
import { WorkspaceSwitcher } from '../features/workspaces/WorkspaceSwitcher.js';
import { http } from '../lib/http.js';
import { useCommand, useUi } from '../lib/store.js';
import { cn } from '../lib/utils.js';

export function Sidebar({ me }: { me: MeDTO }) {
  const { wsId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pagesOpen, setPagesOpen] = useState(true);
  const [driveOpen, setDriveOpen] = useState(localStorage.getItem('notdrive.drive-open') !== '0');

  const favoritesQuery = useQuery({
    queryKey: ['items', wsId, 'favorites'],
    queryFn: () => http.listItems({ favorite: true, archived: false }),
    enabled: !!wsId,
  });

  const setDrive = (v: boolean) => {
    localStorage.setItem('notdrive.drive-open', v ? '1' : '0');
    setDriveOpen(v);
  };

  return (
    <div className="flex h-full flex-col gap-1 px-2 py-3 text-sm">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <WorkspaceSwitcher me={me} />
        </div>
        {wsId && <NotificationBell wsId={wsId} />}
        <OverflowMenu wsId={wsId} />
      </div>

      <SidebarSearchTrigger />

      {(favoritesQuery.data?.length ?? 0) > 0 && (
        <div className="mt-3">
          <div className="px-2 text-[11px] uppercase tracking-wider text-muted-foreground/80">
            Starred
          </div>
          <div className="mt-0.5 flex flex-col">
            {favoritesQuery.data?.slice(0, 6).map((it) => (
              <Link
                key={it.id}
                to={`/w/${wsId}/i/${it.id}`}
                className="group flex items-center gap-2 truncate rounded-md px-2 py-1 hover:bg-muted"
              >
                <Star className="size-3 fill-current text-yellow-500" />
                <span className="truncate">{it.title || 'Untitled'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="-mx-2 mt-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-2">
        {/* Pages */}
        <SectionHeader
          title="Pages"
          open={pagesOpen}
          setOpen={setPagesOpen}
          right={
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                const it = await http.createItem({ title: 'Untitled', parent_id: null });
                await qc.invalidateQueries({ queryKey: ['items', wsId] });
                navigate(`/w/${wsId}/i/${it.id}`);
              }}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-background"
              title="New page (⌘N)"
            >
              <Plus className="size-3.5" />
            </button>
          }
        />
        {pagesOpen && <TreePanel wsId={wsId} />}

        {/* Drive — same tree shape, rendered inline */}
        <SectionHeader
          title="Drive"
          open={driveOpen}
          setOpen={setDrive}
          right={
            <div className="flex items-center gap-0.5">
              <CreateDriveMenu
                trigger={
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="rounded p-0.5 text-muted-foreground transition hover:bg-background"
                    title="Create new Drive file"
                  >
                    <Plus className="size-3.5" />
                  </button>
                }
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/w/${wsId}/drive/trash`);
                }}
                className="rounded p-0.5 text-muted-foreground transition hover:bg-background"
                title="Drive trash"
              >
                <Trash2 className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/w/${wsId}/drive`);
                }}
                className="rounded p-0.5 text-muted-foreground transition hover:bg-background"
                title="Open Drive browser"
              >
                <HardDrive className="size-3.5" />
              </button>
            </div>
          }
        />
        {driveOpen && <DriveTreePanel />}
      </div>

      <div className="flex items-center gap-2 border-t border-border/40 px-2 pt-2 text-xs text-muted-foreground">
        <img
          src={me.user.avatar_url ?? ''}
          alt=""
          className="size-5 rounded-full bg-muted"
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
        <div className="min-w-0 flex-1 truncate">{me.user.email}</div>
        <ThemeToggle />
      </div>
    </div>
  );
}

function ThemeToggle() {
  const dark = useUi((s) => s.darkOverride);
  const setDark = useUi((s) => s.setDark);

  const choose = (m: DarkMode) => {
    setDark(m);
    void http.patchMe({ dark_mode: m }).catch(() => {});
  };

  const opts: {
    value: DarkMode;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { value: 'system', label: 'System', Icon: Monitor },
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'dark', label: 'Dark', Icon: Moon },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-md bg-muted/80 p-0.5">
      {opts.map(({ value, label, Icon }) => (
        <button
          type="button"
          key={value}
          onClick={() => choose(value)}
          title={label}
          aria-label={label}
          aria-pressed={dark === value}
          className={cn(
            'rounded p-1 transition',
            dark === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-3" />
        </button>
      ))}
    </div>
  );
}

function SectionHeader({
  title,
  open,
  setOpen,
  right,
}: {
  title: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="mt-3 flex items-center gap-1 px-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="group flex flex-1 items-center gap-1 rounded-md px-1 py-0.5 text-[11px] uppercase tracking-wider text-muted-foreground/80 transition hover:text-foreground"
      >
        {open ? (
          <ChevronDown className={cn('size-3 opacity-60 transition group-hover:opacity-100')} />
        ) : (
          <ChevronRight className={cn('size-3 opacity-60 transition group-hover:opacity-100')} />
        )}
        <span>{title}</span>
      </button>
      {right}
    </div>
  );
}

function OverflowMenu({ wsId }: { wsId: string }) {
  const navigate = useNavigate();
  const item = (icon: React.ReactNode, label: string, to: string) => (
    <DropdownMenu.Item
      onSelect={() => navigate(to)}
      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
    >
      {icon}
      <span>{label}</span>
    </DropdownMenu.Item>
  );
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground transition hover:bg-muted"
          title="More"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={4}
          align="end"
          className="z-50 w-56 rounded-md border border-border bg-card p-1 shadow-lg"
        >
          {item(<LayoutGrid className="size-3.5" />, 'Views', `/w/${wsId}/views`)}
          {item(<TagIcon className="size-3.5" />, 'Tags', `/w/${wsId}/tags`)}
          {item(<Star className="size-3.5" />, 'Starred', `/w/${wsId}/favorites`)}
          {item(<Clock className="size-3.5" />, 'Recent', `/w/${wsId}/recent`)}
          {item(<Archive className="size-3.5" />, 'Page archive', `/w/${wsId}/archive`)}
          {item(<Trash2 className="size-3.5" />, 'Drive trash', `/w/${wsId}/drive/trash`)}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {item(<Upload className="size-3.5" />, 'Import', `/w/${wsId}/import`)}
          {item(<Settings2 className="size-3.5" />, 'People', `/w/${wsId}/settings/members`)}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// Looks like an input, behaves like a button: opens the existing command
// palette (cmdk) which already does fuzzy search across pages + Drive.
// Centralizing search there means body-text matches, navigation, and
// command execution all share one entry point.
function SidebarSearchTrigger() {
  const setOpen = useCommand((s) => s.setOpen);
  const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="mt-1 flex w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-left text-[12px] text-muted-foreground transition hover:bg-muted"
      aria-label="Search"
    >
      <Search className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">Search…</span>
      <kbd className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono">
        {isMac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}
