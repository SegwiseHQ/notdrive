import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { CommandPalette } from './commands/CommandPalette.js';
import { useHotkeysGlobal } from './commands/hotkeys.js';
import { http, isApiError } from './lib/http.js';
import { useUi, useWorkspace } from './lib/store.js';
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
