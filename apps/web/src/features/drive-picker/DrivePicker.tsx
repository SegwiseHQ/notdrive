import type { DriveTreeNode } from '@notdrive/shared';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, File as FileIcon, Folder } from 'lucide-react';
import { useMemo, useState } from 'react';
import { http } from '../../lib/http.js';

export function DrivePicker({ onClose, onPick }: { onClose: () => void; onPick: (fileId: string) => void }) {
  const tree = useQuery({ queryKey: ['drive-tree'], queryFn: () => http.driveTree(4) });
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    if (!tree.data) return null;
    if (!q.trim()) return tree.data;
    const needle = q.toLowerCase();
    function walk(n: DriveTreeNode): DriveTreeNode | null {
      if (!n.children) {
        return n.name.toLowerCase().includes(needle) ? n : null;
      }
      const kids = n.children.map(walk).filter(Boolean) as DriveTreeNode[];
      if (kids.length > 0 || n.name.toLowerCase().includes(needle)) {
        return { ...n, children: kids };
      }
      return null;
    }
    return walk(tree.data);
  }, [tree.data, q]);

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[70vh] w-[640px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-card shadow-xl">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <Dialog.Title className="text-sm font-semibold">Link a Drive file</Dialog.Title>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter…"
              className="ml-auto w-56 rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {tree.isLoading && <div className="p-6 text-center text-muted-foreground">Loading Drive…</div>}
            {tree.isError && (
              <div className="p-6 text-center text-destructive">
                Failed to load Drive. Re-auth may be required.
              </div>
            )}
            {filtered && <Node node={filtered} depth={0} onPick={onPick} />}
            {filtered === null && !tree.isLoading && (
              <div className="p-6 text-center text-muted-foreground">No matches.</div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Node({
  node,
  depth,
  onPick,
}: {
  node: DriveTreeNode;
  depth: number;
  onPick: (fileId: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isFolder = node.is_folder;
  return (
    <div>
      <div
        className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-accent"
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        {isFolder ? (
          <button onClick={() => setOpen(!open)} className="rounded p-0.5 text-muted-foreground">
            <ChevronRight className={`size-3 transition ${open ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-4" />
        )}
        {isFolder ? (
          <Folder className="size-4 text-yellow-600" />
        ) : (
          <FileIcon className="size-4 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm">{node.name}</span>
        {!isFolder && (
          <button
            onClick={() => onPick(node.id)}
            className="rounded-md bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:opacity-90"
          >
            Select
          </button>
        )}
      </div>
      {open && node.children?.map((c) => <Node key={c.id} node={c} depth={depth + 1} onPick={onPick} />)}
    </div>
  );
}
