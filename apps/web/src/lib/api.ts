import type { AppType } from '@notdrive/api/app-type';
import { hc } from 'hono/client';

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:3000';
const UNSAFE_METHODS = new Set(['POST', 'PATCH', 'DELETE', 'PUT']);

function currentWorkspaceId(): string | undefined {
  // Prefer the workspace id in the current URL (/w/:wsId/…) over localStorage,
  // so requests always target the workspace the user is actually viewing.
  const match = /\/w\/([^/?#]+)/.exec(window.location.pathname);
  if (match?.[1]) return match[1];
  return localStorage.getItem('notdrive.workspace_id') ?? undefined;
}

/**
 * Add the headers expected by the API's workspace and CSRF middleware.
 *
 * Some valid mutations, such as accepting an invite or creating a user's
 * first workspace, do not have a workspace id yet. X-Requested-With makes
 * those requests pass the CSRF check; because it is not a CORS-safelisted
 * header, browsers preflight cross-origin requests before sending them.
 */
export function requestHeaders(headersInit?: HeadersInit, method = 'GET') {
  const headers = new Headers(headersInit);
  const ws = currentWorkspaceId();
  if (ws && !headers.has('x-workspace-id')) headers.set('x-workspace-id', ws);
  if (UNSAFE_METHODS.has(method.toUpperCase()) && !headers.has('x-requested-with')) {
    headers.set('x-requested-with', 'XMLHttpRequest');
  }
  return headers;
}

export const api = hc<AppType>(API_ORIGIN, {
  init: { credentials: 'include' },
  fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const headers = requestHeaders(init?.headers, method);
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
