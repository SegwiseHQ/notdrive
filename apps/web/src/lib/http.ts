import type {
  AutoShareMode,
  CommentThreadDTO,
  DriveRoleLiteral,
  DriveTreeNode,
  ItemDTO,
  MeDTO,
  NotificationListResponseDTO,
  RecentEntryDTO,
  TagDTO,
  ViewDTO,
} from '@notdrive/shared';
import { apiOrigin, requestHeaders } from './api.js';

/**
 * Thin typed fetch helpers colocated with the Hono client. Prefer these over
 * the raw RPC client for endpoints where the RPC client's generic can't
 * narrow far enough (mostly due to zValidator generics).
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`${status} ${statusText}: ${body}`);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = requestHeaders(init?.headers, init?.method);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(`${apiOrigin()}${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, res.statusText, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const http = {
  me: () => req<MeDTO>('/me'),
  patchMe: (patch: { dark_mode?: 'system' | 'light' | 'dark' }) =>
    req<{ ok: true }>('/me', { method: 'PATCH', body: JSON.stringify(patch) }),

  listWorkspaces: () =>
    req<
      Array<{
        id: string;
        name: string;
        role: string;
        created_by: string;
        created_at: number;
        auto_share_mode: AutoShareMode;
        auto_share_role: DriveRoleLiteral;
      }>
    >('/workspaces'),
  patchWorkspace: (
    wsId: string,
    body: {
      name?: string;
      auto_share_mode?: AutoShareMode;
      auto_share_role?: DriveRoleLiteral;
    },
  ) =>
    req<{ ok: true }>(`/workspaces/${wsId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  createWorkspace: (name: string) =>
    req<{ id: string; name: string; role: string }>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  invite: (wsId: string, email: string, role: 'admin' | 'member' | 'viewer') =>
    req<{ token: string }>(`/workspaces/${wsId}/invites`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),
  acceptInvite: (token: string) =>
    req<{ workspace_id: string; role: string }>('/workspaces/invites/accept', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  members: (wsId: string) =>
    req<
      Array<{
        user_id: string;
        role: string;
        email: string;
        name: string;
        avatar_url: string | null;
        joined_at: number;
      }>
    >(`/workspaces/${wsId}/members`),
  patchMember: (wsId: string, uid: string, role: string) =>
    req<{ ok: true }>(`/workspaces/${wsId}/members/${uid}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  removeMember: (wsId: string, uid: string) =>
    req<{ ok: true }>(`/workspaces/${wsId}/members/${uid}`, { method: 'DELETE' }),

  listItems: (params: Record<string, string | number | boolean | undefined>) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return req<ItemDTO[]>(`/items?${qs}`);
  },
  getItem: (id: string) => req<ItemDTO>(`/items/${id}`),
  createItem: (body: {
    title: string;
    parent_id?: string | null;
    type?: 'page' | 'file';
    drive_file_id?: string;
  }) => req<ItemDTO>('/items', { method: 'POST', body: JSON.stringify(body) }),
  patchItem: (id: string, body: { title?: string; is_favorite?: boolean; body?: string | null }) =>
    req<ItemDTO>(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  moveItem: (
    id: string,
    body: { parent_id: string | null; before_id?: string; after_id?: string },
  ) => req<ItemDTO>(`/items/${id}/move`, { method: 'PATCH', body: JSON.stringify(body) }),
  archiveItem: (id: string) => req<{ ok: true }>(`/items/${id}`, { method: 'DELETE' }),
  duplicateItem: (id: string) => req<ItemDTO>(`/items/${id}/duplicate`, { method: 'POST' }),
  purgeItem: (id: string) => req<{ ok: true }>(`/items/${id}?hard=1`, { method: 'DELETE' }),
  restoreItem: (id: string) => req<ItemDTO>(`/items/${id}/restore`, { method: 'POST' }),
  openItem: (id: string) => req<{ ok: true }>(`/items/${id}/open`, { method: 'POST' }),
  linkFile: (id: string, drive_file_id: string) =>
    req<ItemDTO>(`/items/${id}/link`, { method: 'POST', body: JSON.stringify({ drive_file_id }) }),
  unlinkFile: (id: string) => req<ItemDTO>(`/items/${id}/link`, { method: 'DELETE' }),
  attachTag: (itemId: string, tagId: string) =>
    req<{ ok: true }>(`/items/${itemId}/tags/${tagId}`, { method: 'POST' }),
  detachTag: (itemId: string, tagId: string) =>
    req<{ ok: true }>(`/items/${itemId}/tags/${tagId}`, { method: 'DELETE' }),

  listTags: () => req<TagDTO[]>('/tags'),
  createTag: (name: string, color: string) =>
    req<TagDTO>('/tags', { method: 'POST', body: JSON.stringify({ name, color }) }),
  patchTag: (id: string, body: { name?: string; color?: string }) =>
    req<{ ok: true }>(`/tags/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTag: (id: string) => req<{ ok: true }>(`/tags/${id}`, { method: 'DELETE' }),

  listViews: () => req<ViewDTO[]>('/views'),
  createView: (body: { name: string; query: string; layout: string }) =>
    req<{ id: string }>('/views', { method: 'POST', body: JSON.stringify(body) }),
  patchView: (id: string, body: { name?: string; query?: string; layout?: string }) =>
    req<{ ok: true }>(`/views/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteView: (id: string) => req<{ ok: true }>(`/views/${id}`, { method: 'DELETE' }),

  search: (q: string) => req<ItemDTO[]>(`/search?q=${encodeURIComponent(q)}`),
  recent: () => req<RecentEntryDTO[]>('/recent'),

  driveTree: (depth = 4) => req<DriveTreeNode>(`/drive/tree?depth=${depth}`),
  driveSearch: (q: string, limit = 50) =>
    req<DriveTreeNode[]>(`/drive/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  driveFile: (id: string) =>
    req<{ drive_file_id: string; name: string; web_view_link: string | null }>(
      `/drive/files/${id}`,
    ),
  driveSync: () => req<{ processed: number }>('/drive/sync', { method: 'POST' }),
  trashDriveFile: (fileId: string) =>
    req<{ ok: true; permanent: false }>(`/drive/files/${fileId}`, { method: 'DELETE' }),
  permanentlyDeleteDriveFile: (fileId: string) =>
    req<{ ok: true; permanent: true }>(`/drive/files/${fileId}?permanent=1`, { method: 'DELETE' }),
  untrashDriveFile: (fileId: string) =>
    req<{ ok: true }>(`/drive/files/${fileId}/untrash`, { method: 'POST' }),
  driveTrash: () => req<DriveTreeNode[]>('/drive/trash'),

  listPermissions: (fileId: string) =>
    req<
      Array<{
        id: string;
        type: 'user' | 'group' | 'domain' | 'anyone';
        role: string;
        email: string | null;
        display_name: string | null;
        domain: string | null;
        photo_link: string | null;
        allow_file_discovery: boolean | null;
        deleted: boolean;
      }>
    >(`/drive/files/${fileId}/permissions`),
  addPermission: (
    fileId: string,
    body: {
      type: 'user' | 'group' | 'domain' | 'anyone';
      role: 'reader' | 'commenter' | 'writer';
      email?: string;
      domain?: string;
      send_notification_email?: boolean;
      email_message?: string;
    },
  ) =>
    req<{ id: string; type: string; role: string }>(`/drive/files/${fileId}/permissions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePermission: (fileId: string, pid: string, role: 'reader' | 'commenter' | 'writer') =>
    req<{ id: string; role: string }>(`/drive/files/${fileId}/permissions/${pid}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  removePermission: (fileId: string, pid: string) =>
    req<{ ok: true }>(`/drive/files/${fileId}/permissions/${pid}`, { method: 'DELETE' }),
  enableLinkShare: (fileId: string, role: 'reader' | 'commenter' | 'writer' = 'reader') =>
    req<{ web_view_link: string | null; permission: { id: string; role: string } }>(
      `/drive/files/${fileId}/share-link`,
      { method: 'POST', body: JSON.stringify({ role }) },
    ),
  disableLinkShare: (fileId: string) =>
    req<{ ok: true }>(`/drive/files/${fileId}/share-link`, { method: 'DELETE' }),

  createDriveFile: (body: {
    name: string;
    mime_type: string;
    parent_folder_id?: string;
    create_page?: boolean;
  }) =>
    req<{
      file: {
        drive_file_id: string;
        name: string;
        mime_type: string;
        web_view_link: string | null;
        is_folder: boolean;
      };
      item: ItemDTO | null;
    }>('/drive/files', { method: 'POST', body: JSON.stringify(body) }),

  importZip: async (file: File, opts: { private?: boolean } = {}) => {
    const form = new FormData();
    form.append('file', file);
    if (opts.private) form.append('private', 'true');
    const headers = requestHeaders(undefined, 'POST');
    const res = await fetch(`${apiOrigin()}/import/zip`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
    return (await res.json()) as {
      created: number;
      skipped: number;
      total_files: number;
      errors: Array<{ path: string; reason: string }>;
    };
  },

  // Upload a binary asset to an item; returns the URL the editor inserts as <img src>.
  uploadItemAsset: async (itemId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const headers = requestHeaders(undefined, 'POST');
    const res = await fetch(`${apiOrigin()}/items/${encodeURIComponent(itemId)}/assets`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
    return (await res.json()) as { id: string; url: string };
  },

  listComments: (itemId: string) =>
    req<{ threads: CommentThreadDTO[] }>(`/items/${encodeURIComponent(itemId)}/comments`),
  createComment: (itemId: string, body: { body: string; anchor?: string; thread_id?: string }) =>
    req<{ thread_id: string; comment_id: string; anchor: string | null }>(
      `/items/${encodeURIComponent(itemId)}/comments`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  editComment: (id: string, body: { body: string }) =>
    req<{ ok: true }>(`/comments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteComment: (id: string) =>
    req<{ ok: true }>(`/comments/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listNotifications: () => req<NotificationListResponseDTO>('/notifications'),
  markNotificationsRead: (ids: string[]) =>
    req<{ ok: true }>('/notifications/mark-read', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  markAllNotificationsRead: () =>
    req<{ ok: true }>('/notifications/mark-all-read', { method: 'POST' }),

  logout: () => req<{ ok: true }>('/auth/logout', { method: 'POST' }),
};
