import { afterEach, describe, expect, it, vi } from 'vitest';
import { http } from './http.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubBrowser(pathname: string, workspaceId: string | null = null) {
  vi.stubGlobal('window', {
    location: { pathname },
    localStorage: {
      getItem: vi.fn(() => workspaceId),
    },
  });
  vi.stubGlobal('localStorage', window.localStorage);
}

describe('HTTP request headers', () => {
  it('sends the CSRF header when accepting an invite without a workspace', async () => {
    stubBrowser('/invites/accept/');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ workspace_id: 'ws-1', role: 'member' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(http.acceptInvite('invite-token')).resolves.toEqual({
      workspace_id: 'ws-1',
      role: 'member',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('x-workspace-id')).toBeNull();
    expect(headers.get('x-requested-with')).toBe('XMLHttpRequest');
  });

  it('does not preflight read-only requests unnecessarily', async () => {
    stubBrowser('/');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'user-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await http.me();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('x-requested-with')).toBeNull();
  });
});
