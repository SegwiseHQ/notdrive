import type { DarkMode } from '@notdrive/shared';
import type { QueryClient } from '@tanstack/react-query';
import type { NavigateFunction } from 'react-router-dom';
import { http } from '../lib/http.js';
import { useSelection } from '../lib/store.js';

export interface CommandContext {
  wsId: string;
  itemId: string | null;
  navigate: NavigateFunction;
  qc: QueryClient;
  setDark: (m: DarkMode) => void;
  toggleSidebar: () => void;
  openPalette: (v: boolean) => void;
  toast: (msg: string) => void;
}

export interface Command {
  id: string;
  title: string;
  section: string;
  keywords?: string;
  shortcut?: string; // display-only + used by useHotkeysGlobal
  when?: (ctx: CommandContext) => boolean;
  run: (ctx: CommandContext) => void | Promise<void>;
}

export const COMMANDS: Command[] = [
  {
    id: 'item.create',
    title: 'New page',
    section: 'Pages',
    shortcut: '⌘N',
    run: async (c) => {
      const parentId = c.itemId ?? null;
      const it = await http.createItem({ title: 'Untitled', parent_id: parentId });
      await c.qc.invalidateQueries({ queryKey: ['items', c.wsId] });
      c.navigate(`/w/${c.wsId}/i/${it.id}`);
    },
  },
  {
    id: 'item.archive',
    title: 'Archive current item',
    section: 'Pages',
    when: (c) => !!c.itemId,
    run: async (c) => {
      if (!c.itemId) return;
      await http.archiveItem(c.itemId);
      c.qc.invalidateQueries();
      useSelection.getState().select(null);
      c.toast('Archived');
      c.navigate(`/w/${c.wsId}`);
    },
  },
  {
    id: 'item.favorite.toggle',
    title: 'Toggle favorite',
    section: 'Pages',
    when: (c) => !!c.itemId,
    run: async (c) => {
      if (!c.itemId) return;
      const cur = await http.getItem(c.itemId);
      await http.patchItem(c.itemId, { is_favorite: !cur.is_favorite });
      c.qc.invalidateQueries();
    },
  },
  {
    id: 'nav.drive',
    title: 'Browse My Drive',
    section: 'Navigate',
    keywords: 'drive files google',
    run: (c) => c.navigate(`/w/${c.wsId}/drive`),
  },
  {
    id: 'nav.favorites',
    title: 'Go to Favorites',
    section: 'Navigate',
    run: (c) => c.navigate(`/w/${c.wsId}/favorites`),
  },
  {
    id: 'nav.archive',
    title: 'Go to Archive',
    section: 'Navigate',
    run: (c) => c.navigate(`/w/${c.wsId}/archive`),
  },
  {
    id: 'nav.recent',
    title: 'Go to Recent',
    section: 'Navigate',
    run: (c) => c.navigate(`/w/${c.wsId}/recent`),
  },
  {
    id: 'nav.members',
    title: 'People',
    section: 'Navigate',
    run: (c) => c.navigate(`/w/${c.wsId}/settings/members`),
  },
  {
    id: 'view.switch.list',
    title: 'Switch to List view',
    section: 'Views',
    shortcut: '⌘1',
    run: () => emitViewChange('list'),
  },
  {
    id: 'view.switch.grid',
    title: 'Switch to Grid view',
    section: 'Views',
    shortcut: '⌘2',
    run: () => emitViewChange('grid'),
  },
  {
    id: 'view.switch.timeline',
    title: 'Switch to Timeline view',
    section: 'Views',
    shortcut: '⌘3',
    run: () => emitViewChange('timeline'),
  },
  {
    id: 'view.switch.tagboard',
    title: 'Switch to Tagboard view',
    section: 'Views',
    shortcut: '⌘4',
    run: () => emitViewChange('tagboard'),
  },
  {
    id: 'drive.sync',
    title: 'Sync Drive changes now',
    section: 'Drive',
    run: async (c) => {
      const r = await http.driveSync();
      c.toast(`Synced (${r.processed} changes)`);
      c.qc.invalidateQueries();
    },
  },
  ...(
    [
      ['doc', 'Google Doc', 'application/vnd.google-apps.document', 'Untitled document'],
      ['sheet', 'Google Sheet', 'application/vnd.google-apps.spreadsheet', 'Untitled spreadsheet'],
      [
        'slides',
        'Google Slides',
        'application/vnd.google-apps.presentation',
        'Untitled presentation',
      ],
      ['drawing', 'Google Drawing', 'application/vnd.google-apps.drawing', 'Untitled drawing'],
      ['form', 'Google Form', 'application/vnd.google-apps.form', 'Untitled form'],
      ['folder', 'Folder', 'application/vnd.google-apps.folder', 'Untitled folder'],
    ] as const
  ).map(([slug, label, mime, defaultName]) => ({
    id: `drive.create.${slug}`,
    title: `New ${label}`,
    section: 'Drive',
    keywords: `create ${label}`,
    run: async (c: CommandContext) => {
      const name = window.prompt(`Name for new ${label}`, defaultName);
      if (!name || !name.trim()) return;
      const res = await http.createDriveFile({
        name: name.trim(),
        mime_type: mime,
        create_page: mime !== 'application/vnd.google-apps.folder',
      });
      await c.qc.invalidateQueries({ queryKey: ['drive-tree'] });
      await c.qc.invalidateQueries({ queryKey: ['items'] });
      c.toast(`Created ${res.file.name}`);
      if (res.item) c.navigate(`/w/${c.wsId}/i/${res.item.id}`);
      else if (res.file.web_view_link) window.open(res.file.web_view_link, '_blank');
    },
  })),
  {
    id: 'theme.light',
    title: 'Theme: Light',
    section: 'Appearance',
    run: (c) => {
      c.setDark('light');
      void http.patchMe({ dark_mode: 'light' });
    },
  },
  {
    id: 'theme.dark',
    title: 'Theme: Dark',
    section: 'Appearance',
    run: (c) => {
      c.setDark('dark');
      void http.patchMe({ dark_mode: 'dark' });
    },
  },
  {
    id: 'theme.system',
    title: 'Theme: System',
    section: 'Appearance',
    run: (c) => {
      c.setDark('system');
      void http.patchMe({ dark_mode: 'system' });
    },
  },
  {
    id: 'ui.sidebar.toggle',
    title: 'Toggle sidebar',
    section: 'Appearance',
    shortcut: '⌘\\',
    run: (c) => c.toggleSidebar(),
  },
  {
    id: 'auth.logout',
    title: 'Log out',
    section: 'Account',
    run: async (c) => {
      await http.logout();
      c.navigate('/login');
    },
  },
];

// ---- Layout switcher bus ----
type Listener = (layout: 'list' | 'grid' | 'timeline' | 'tagboard') => void;
const layoutBus: Set<Listener> = new Set();
export function onLayoutChange(fn: Listener) {
  layoutBus.add(fn);
  return () => layoutBus.delete(fn);
}
function emitViewChange(l: 'list' | 'grid' | 'timeline' | 'tagboard') {
  for (const fn of layoutBus) fn(l);
}
