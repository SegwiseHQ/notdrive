import { useQuery } from '@tanstack/react-query';
import { Menu, Search } from 'lucide-react';
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router';
import { CommandPalette } from './commands/CommandPalette.js';
import { useHotkeysGlobal } from './commands/hotkeys.js';
import { useIsMobile } from './lib/hooks.js';
import { http, isApiError } from './lib/http.js';
import { useCommand, useUi, useWorkspace } from './lib/store.js';
import { useApplyTheme } from './lib/theme.js';
import { cn } from './lib/utils.js';
import { BulkActionBar } from './panes/BulkActionBar.js';
import { Sidebar } from './panes/Sidebar.js';
import { SidebarResizer } from './panes/SidebarResizer.js';

export function AppShell() {
  useApplyTheme();
  useHotkeysGlobal();
  const { wsId } = useParams();
  const sidebarCollapsed = useUi((s) => s.sidebarCollapsed);
  const sidebarWidth = useUi((s) => s.sidebarWidth);
  const setActiveWs = useWorkspace((s) => s.setActiveWs);
  const isMobile = useIsMobile();
  const mobileNavOpen = useUi((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUi((s) => s.setMobileNavOpen);
  const openPalette = useCommand((s) => s.setOpen);
  const location = useLocation();

  // Close the mobile drawer whenever the user navigates somewhere.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on route change only.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, setMobileNavOpen]);

  // Lock background scroll while the drawer is open; Escape closes it.
  useEffect(() => {
    if (!isMobile || !mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isMobile, mobileNavOpen, setMobileNavOpen]);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: http.me,
    retry: (failureCount, error) =>
      !(isApiError(error) && error.status === 401) && failureCount < 2,
  });

  useEffect(() => {
    if (wsId) setActiveWs(wsId);
  }, [wsId, setActiveWs]);

  if (meQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (meQuery.isError) {
    if (isApiError(meQuery.error) && meQuery.error.status === 401) {
      return <Navigate to="/login" replace />;
    }
    return (
      <div className="flex h-full items-center justify-center bg-background p-6">
        <div className="flex max-w-sm flex-col gap-3 rounded-lg border border-border bg-card p-5 text-sm shadow-sm">
          <div className="font-medium text-foreground">NotDrive is temporarily unavailable</div>
          <div className="text-muted-foreground">
            Your session may still be valid. Check your connection or retry in a moment.
          </div>
          <button
            type="button"
            className="inline-flex w-fit items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            onClick={() => void meQuery.refetch()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const me = meQuery.data;
  if (!me) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Unable to load your workspace. Retry in a moment.
      </div>
    );
  }
  if (!wsId) {
    const defaultWs = me.workspaces[0];
    if (!defaultWs)
      return (
        <div className="p-8 text-muted-foreground">Something went wrong. Log out and retry.</div>
      );
    // Declarative redirect — calling navigate() during render fires a setState
    // on the RouterProvider mid-render and triggers a React warning.
    return <Navigate to={`/w/${defaultWs.id}`} replace />;
  }

  if (isMobile) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-2 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="rounded-md p-2 text-muted-foreground transition hover:bg-muted"
            aria-label="Open navigation"
            aria-expanded={mobileNavOpen}
          >
            <Menu className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => openPalette(true)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-left text-sm text-muted-foreground"
            aria-label="Search"
          >
            <Search className="size-4 shrink-0" />
            <span className="truncate">Search…</span>
          </button>
        </header>
        <main className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden bg-background">
          <Outlet />
        </main>

        {/* Off-canvas drawer */}
        <button
          type="button"
          className={cn(
            'fixed inset-0 z-40 bg-black/50 transition-opacity duration-200',
            mobileNavOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
          tabIndex={mobileNavOpen ? 0 : -1}
        />
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[320px] bg-sidebar pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl transition-transform duration-200 ease-out',
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          aria-hidden={!mobileNavOpen}
          inert={!mobileNavOpen}
          onClickCapture={(e) => {
            // Links to the current route don't change the pathname, so close explicitly.
            if ((e.target as HTMLElement).closest('a[href]')) setMobileNavOpen(false);
          }}
        >
          <Sidebar me={me} />
        </aside>
        <CommandPalette />
        <BulkActionBar />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <aside
        className={cn(
          'relative h-full shrink-0 overflow-hidden bg-sidebar',
          sidebarCollapsed && 'w-0',
        )}
        style={sidebarCollapsed ? undefined : { width: sidebarWidth }}
      >
        <Sidebar me={me} />
        {!sidebarCollapsed && <SidebarResizer />}
      </aside>
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-background">
        <Outlet />
      </main>
      <CommandPalette />
      <BulkActionBar />
    </div>
  );
}
