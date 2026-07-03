import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { CommandPalette } from './commands/CommandPalette.js';
import { useHotkeysGlobal } from './commands/hotkeys.js';
import { http } from './lib/http.js';
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

  const meQuery = useQuery({ queryKey: ['me'], queryFn: http.me });

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
  if (meQuery.isError) return <Navigate to="/login" replace />;

  const me = meQuery.data;
  if (!me) return <Navigate to="/login" replace />;
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
