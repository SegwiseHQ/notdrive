import * as Dialog from '@radix-ui/react-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useDebounced } from '../lib/hooks.js';
import { http } from '../lib/http.js';
import { useCommand, useSelection, useUi } from '../lib/store.js';
import { COMMANDS, type CommandContext } from './registry.js';

export function CommandPalette() {
  const open = useCommand((s) => s.open);
  const setOpen = useCommand((s) => s.setOpen);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { wsId = '' } = useParams();
  const itemId = useSelection((s) => s.selectedItemId);
  const setDark = useUi((s) => s.setDark);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const [q, setQ] = useState('');

  const ctx: CommandContext = {
    wsId,
    itemId,
    navigate,
    qc,
    setDark,
    toggleSidebar,
    openPalette: setOpen,
    toast: (m) => toast.success(m),
  };
  const visible = useMemo(() => COMMANDS.filter((c) => (c.when ? c.when(ctx) : true)), [ctx]);

  const searchQuery = useQuery({
    queryKey: ['search', wsId, q],
    queryFn: () => http.search(q),
    enabled: open && q.trim().length > 0,
    staleTime: 2_000,
  });

  // Debounce the Drive query so rapid typing doesn't fire one HTTP call per
  // keystroke. The local item search stays per-keystroke since it's cheap.
  const debouncedQ = useDebounced(q, 250);
  const driveSearch = useQuery({
    queryKey: ['drive-search', debouncedQ],
    queryFn: () => http.driveSearch(debouncedQ, 10),
    enabled: open && debouncedQ.trim().length >= 1,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-32 z-50 w-[560px] max-w-[95vw] -translate-x-1/2 rounded-lg border border-border bg-card shadow-2xl">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command loop shouldFilter={false}>
            <Command.Input
              autoFocus
              placeholder="Search pages and Drive files, or type a command…"
              value={q}
              onValueChange={setQ}
              className="w-full rounded-t-lg border-b border-border bg-transparent px-4 py-3 text-sm outline-none"
            />
            <Command.List className="max-h-[60vh] overflow-auto p-1">
              <Command.Empty className="p-4 text-sm text-muted-foreground">No results</Command.Empty>

              {searchQuery.data && searchQuery.data.length > 0 && (
                <Command.Group heading="Pages">
                  {searchQuery.data.slice(0, 8).map((it) => (
                    <Command.Item
                      key={it.id}
                      value={`item:${it.id} ${it.title}`}
                      onSelect={() => {
                        setOpen(false);
                        navigate(`/w/${wsId}/i/${it.id}`);
                      }}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent"
                    >
                      <span className="min-w-0 flex-1 truncate">{it.title}</span>
                      {it.drive?.name && (
                        <span className="truncate text-xs text-muted-foreground">{it.drive.name}</span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {q.trim().length >= 1 && (
                <Command.Group
                  heading={
                    driveSearch.isFetching
                      ? 'Drive files · searching…'
                      : `Drive files${driveSearch.data ? ` · ${driveSearch.data.length}` : ''}`
                  }
                >
                  {driveSearch.isFetching && !driveSearch.data && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Searching Drive…
                    </div>
                  )}
                  {driveSearch.data && driveSearch.data.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No Drive files match.
                    </div>
                  )}
                  {driveSearch.data?.map((f) => (
                    <Command.Item
                      key={`drive:${f.id}`}
                      value={`drive:${f.id} ${f.name}`}
                      onSelect={() => {
                        setOpen(false);
                        navigate(`/w/${wsId}/drive/file/${f.id}`);
                      }}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent"
                    >
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      {f.is_folder && (
                        <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                          folder
                        </span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {Object.entries(groupBy(visible)).map(([section, cmds]) => (
                <Command.Group heading={section} key={section}>
                  {cmds
                    .filter((c) =>
                      q.trim() === '' ? true : (c.title + ' ' + (c.keywords ?? '')).toLowerCase().includes(q.toLowerCase()),
                    )
                    .map((c) => (
                      <Command.Item
                        key={c.id}
                        value={c.id + ' ' + c.title}
                        onSelect={() => {
                          setOpen(false);
                          void c.run(ctx);
                        }}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent"
                      >
                        <span className="min-w-0 flex-1 truncate">{c.title}</span>
                        {c.shortcut && (
                          <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                            {c.shortcut}
                          </span>
                        )}
                      </Command.Item>
                    ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function groupBy(cmds: typeof COMMANDS) {
  return cmds.reduce<Record<string, typeof COMMANDS>>((acc, c) => {
    (acc[c.section] ??= []).push(c);
    return acc;
  }, {});
}
