import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useCommand, useSelection, useUi } from '../lib/store.js';
import { COMMANDS, type CommandContext } from './registry.js';

const SHORTCUT_MAP: Record<string, string> = {
  '⌘K': 'open:palette',
  '⌘N': 'item.create',
  '⌘\\': 'ui.sidebar.toggle',
  '⌘1': 'view.switch.list',
  '⌘2': 'view.switch.grid',
  '⌘3': 'view.switch.timeline',
  '⌘4': 'view.switch.tagboard',
};

export function useHotkeysGlobal() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { wsId = '' } = useParams();
  const itemId = useSelection((s) => s.selectedItemId);
  const setDark = useUi((s) => s.setDark);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const openPalette = useCommand((s) => s.setOpen);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      let shortcut: string | undefined;
      if (key === 'k') shortcut = '⌘K';
      else if (key === 'n') shortcut = '⌘N';
      else if (key === '\\') shortcut = '⌘\\';
      else if (key === '1') shortcut = '⌘1';
      else if (key === '2') shortcut = '⌘2';
      else if (key === '3') shortcut = '⌘3';
      else if (key === '4') shortcut = '⌘4';
      if (!shortcut) return;
      const target = SHORTCUT_MAP[shortcut];
      if (!target) return;
      e.preventDefault();
      if (target === 'open:palette') {
        openPalette(true);
        return;
      }
      const cmd = COMMANDS.find((c) => c.id === target);
      if (!cmd) return;
      const ctx: CommandContext = {
        wsId,
        itemId,
        navigate,
        qc,
        setDark,
        toggleSidebar,
        openPalette,
        toast: (m) => toast.success(m),
      };
      if (cmd.when && !cmd.when(ctx)) return;
      void cmd.run(ctx);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [wsId, itemId, navigate, qc, setDark, toggleSidebar, openPalette]);
}
