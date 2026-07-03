import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from './AppShell.js';
import { AcceptInvitePage } from './pages/AcceptInvitePage.js';
import { ArchivePage } from './pages/ArchivePage.js';
import { DriveFilePage } from './pages/DriveFilePage.js';
import { DrivePage } from './pages/DrivePage.js';
import { DriveTrashPage } from './pages/DriveTrashPage.js';
import { FavoritesPage } from './pages/FavoritesPage.js';
import { ImportPage } from './pages/ImportPage.js';
import { ItemPage } from './pages/ItemPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { MembersPage } from './pages/MembersPage.js';
import { RecentPage } from './pages/RecentPage.js';
import { TagPage } from './pages/TagPage.js';
import { TagsIndexPage } from './pages/TagsIndexPage.js';
import { ViewPage } from './pages/ViewPage.js';
import { ViewsIndexPage } from './pages/ViewsIndexPage.js';
import { WorkspaceHome } from './pages/WorkspaceHome.js';
import { WorkspacePicker } from './pages/WorkspacePicker.js';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/invites/accept', element: <AcceptInvitePage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <WorkspacePicker /> },
      { path: 'w/:wsId', element: <WorkspaceHome /> },
      { path: 'w/:wsId/drive', element: <DrivePage /> },
      { path: 'w/:wsId/drive/trash', element: <DriveTrashPage /> },
      { path: 'w/:wsId/drive/file/:fileId', element: <DriveFilePage /> },
      { path: 'w/:wsId/i/:itemId', element: <ItemPage /> },
      { path: 'w/:wsId/views', element: <ViewsIndexPage /> },
      { path: 'w/:wsId/view/:viewId', element: <ViewPage /> },
      { path: 'w/:wsId/tags', element: <TagsIndexPage /> },
      { path: 'w/:wsId/tags/:tagId', element: <TagPage /> },
      { path: 'w/:wsId/archive', element: <ArchivePage /> },
      { path: 'w/:wsId/favorites', element: <FavoritesPage /> },
      { path: 'w/:wsId/recent', element: <RecentPage /> },
      { path: 'w/:wsId/settings/members', element: <MembersPage /> },
      { path: 'w/:wsId/import', element: <ImportPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
