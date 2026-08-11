import type { ContentSort, DarkMode } from '@notdrive/shared';
import { create } from 'zustand';

interface UiState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  darkOverride: DarkMode;
  pageSort: ContentSort;
  driveSort: ContentSort;
  toggleSidebar: () => void;
  setDark: (m: DarkMode) => void;
  setPageSort: (sort: ContentSort) => void;
  setDriveSort: (sort: ContentSort) => void;
  setSidebarWidth: (w: number) => void;
}

export const SIDEBAR_LIMITS = { MIN: 200, MAX: 480 };

const initialSidebarWidth = (() => {
  const raw = Number(localStorage.getItem('notdrive.sidebar_w'));
  if (!raw || Number.isNaN(raw)) return 240;
  return Math.min(SIDEBAR_LIMITS.MAX, Math.max(SIDEBAR_LIMITS.MIN, raw));
})();

function storedSort(key: string): ContentSort {
  return localStorage.getItem(key) === 'alphabetical' ? 'alphabetical' : 'modified';
}

export const useUi = create<UiState>((set) => ({
  sidebarCollapsed: false,
  sidebarWidth: initialSidebarWidth,
  darkOverride: (localStorage.getItem('notdrive.dark') as DarkMode) ?? 'system',
  pageSort: storedSort('notdrive.page_sort'),
  driveSort: storedSort('notdrive.drive_sort'),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setDark: (m) => {
    localStorage.setItem('notdrive.dark', m);
    set({ darkOverride: m });
  },
  setPageSort: (sort) => {
    localStorage.setItem('notdrive.page_sort', sort);
    set({ pageSort: sort });
  },
  setDriveSort: (sort) => {
    localStorage.setItem('notdrive.drive_sort', sort);
    set({ driveSort: sort });
  },
  setSidebarWidth: (w) => {
    const clamped = Math.min(SIDEBAR_LIMITS.MAX, Math.max(SIDEBAR_LIMITS.MIN, Math.round(w)));
    localStorage.setItem('notdrive.sidebar_w', String(clamped));
    set({ sidebarWidth: clamped });
  },
}));

interface SelectionState {
  selectedItemId: string | null;
  expandedIds: Set<string>;
  select: (id: string | null) => void;
  toggleExpand: (id: string) => void;
  expand: (id: string) => void;
}

export const useSelection = create<SelectionState>((set) => ({
  selectedItemId: null,
  expandedIds: new Set<string>(),
  select: (id) => set({ selectedItemId: id }),
  toggleExpand: (id) =>
    set((s) => {
      const next = new Set(s.expandedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedIds: next };
    }),
  expand: (id) =>
    set((s) => {
      if (s.expandedIds.has(id)) return s;
      const next = new Set(s.expandedIds);
      next.add(id);
      return { expandedIds: next };
    }),
}));

interface CommandState {
  open: boolean;
  setOpen: (v: boolean) => void;
}
export const useCommand = create<CommandState>((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
}));

interface BulkState {
  pages: Set<string>;
  drive: Set<string>;
  togglePage: (id: string) => void;
  toggleDrive: (id: string) => void;
  clear: () => void;
}

export const useBulk = create<BulkState>((set) => ({
  pages: new Set<string>(),
  drive: new Set<string>(),
  togglePage: (id) =>
    set((s) => {
      const next = new Set(s.pages);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { pages: next, drive: new Set<string>() };
    }),
  toggleDrive: (id) =>
    set((s) => {
      const next = new Set(s.drive);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { drive: next, pages: new Set<string>() };
    }),
  clear: () => set({ pages: new Set<string>(), drive: new Set<string>() }),
}));

interface WorkspaceState {
  activeWsId: string | null;
  setActiveWs: (id: string) => void;
}
export const useWorkspace = create<WorkspaceState>((set) => ({
  activeWsId: localStorage.getItem('notdrive.workspace_id'),
  setActiveWs: (id) => {
    localStorage.setItem('notdrive.workspace_id', id);
    set({ activeWsId: id });
  },
}));
