import type { AppType } from '@notdrive/api/app-type';
import { hc } from 'hono/client';

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:3000';

function currentWorkspaceId(): string | undefined {
  // Prefer the workspace id in the current URL (/w/:wsId/…) over localStorage,
  // so requests always target the workspace the user is actually viewing.
  const match = /\/w\/([^/?#]+)/.exec(window.location.pathname);
  if (match?.[1]) return match[1];
  return localStorage.getItem('notdrive.workspace_id') ?? undefined;
}

export const api = hc<AppType>(API_ORIGIN, {
  init: { credentials: 'include' },
  fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const headers = new Headers(init?.headers);
    const ws = currentWorkspaceId();
    if (ws && !headers.has('x-workspace-id')) headers.set('x-workspace-id', ws);
    return fetch(input, { ...init, headers, credentials: 'include' });
  },
});

export function setActiveWorkspace(id: string) {
  localStorage.setItem('notdrive.workspace_id', id);
}

export function clearActiveWorkspace() {
  localStorage.removeItem('notdrive.workspace_id');
}

export function apiOrigin() {
  return API_ORIGIN;
}
