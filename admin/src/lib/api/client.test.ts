import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthTokenResponse } from '@fashion-ais/types';
import {
  AdminApiError,
  adminApiRequest,
  createAdminAuthSessionCoordinator,
  createAuthenticatedAdminApiClient,
} from './client';

const session: AuthTokenResponse = {
  accessToken: 'new-admin-token',
  user: {
    id: 'admin-id',
    email: 'admin@example.com',
    displayName: null,
    status: 'ACTIVE',
    isSystemAdmin: true,
  },
};

function successResponse<T>(data: T): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('preserves Authorization from a Headers instance', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = (async (_input, init) => {
    assert.equal(init?.credentials, 'include');
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      'Bearer admin-access-token',
    );
    return successResponse({ ok: true });
  }) as typeof fetch;

  await adminApiRequest('/admin/overview', {
    headers: new Headers({ authorization: 'Bearer admin-access-token' }),
  });
});

test('login token is attached to the next admin protected request', async () => {
  let token: string | null = null;
  const authorizations: Array<string | null> = [];
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    if (path === '/admin/auth/login') return session as T;
    authorizations.push(new Headers(init?.headers).get('authorization'));
    return { ok: true } as T;
  };
  const loginSession = await request<AuthTokenResponse>('/admin/auth/login');
  token = loginSession.accessToken;
  const client = createAuthenticatedAdminApiClient({
    getAccessToken: () => token,
    onSession: (next) => { token = next.accessToken; },
    onAuthFailure: () => { token = null; },
    refreshSession: createAdminAuthSessionCoordinator(request).refresh,
    request,
  });

  await client('/admin/overview');
  assert.deepEqual(authorizations, ['Bearer new-admin-token']);
});

test('refresh bootstrap token is attached to admin me and overview requests', async () => {
  let token: string | null = null;
  const protectedRequests: Array<[string, string | null]> = [];
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    if (path === '/admin/auth/refresh') return session as T;
    protectedRequests.push([path, new Headers(init?.headers).get('authorization')]);
    return session.user as T;
  };
  const coordinator = createAdminAuthSessionCoordinator(request);
  const restoredSession = await coordinator.bootstrap();
  token = restoredSession.accessToken;
  const client = createAuthenticatedAdminApiClient({
    getAccessToken: () => token,
    onSession: (next) => { token = next.accessToken; },
    onAuthFailure: () => { token = null; },
    refreshSession: coordinator.refresh,
    request,
  });

  await client('/admin/me');
  await client('/admin/overview');
  assert.deepEqual(protectedRequests, [
    ['/admin/me', 'Bearer new-admin-token'],
    ['/admin/overview', 'Bearer new-admin-token'],
  ]);
});

test('admin requests share one refresh and retry once', async () => {
  let token: string | null = 'expired-admin-token';
  let refreshCalls = 0;
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    if (path === '/admin/auth/refresh') {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return session as T;
    }
    if (new Headers(init?.headers).get('authorization') === 'Bearer expired-admin-token') {
      throw new AdminApiError('expired', 401);
    }
    return { ok: true } as T;
  };
  const client = createAuthenticatedAdminApiClient({
    getAccessToken: () => token,
    onSession: (next) => { token = next.accessToken; },
    onAuthFailure: () => { token = null; },
    refreshSession: createAdminAuthSessionCoordinator(request).refresh,
    request,
  });

  await Promise.all([client('/admin/one'), client('/admin/two'), client('/admin/three')]);
  assert.equal(refreshCalls, 1);
  assert.equal(token, 'new-admin-token');
});

test('admin refresh failure clears state and auth endpoints do not recurse', async () => {
  let token: string | null = 'expired-admin-token';
  let cleared = 0;
  let refreshCalls = 0;
  const request = async <T>(path: string): Promise<T> => {
    if (path === '/admin/auth/refresh') refreshCalls += 1;
    throw new AdminApiError('unauthorized', 401);
  };
  const client = createAuthenticatedAdminApiClient({
    getAccessToken: () => token,
    onSession: () => undefined,
    onAuthFailure: () => { token = null; cleared += 1; },
    refreshSession: createAdminAuthSessionCoordinator(request).refresh,
    request,
  });

  await assert.rejects(client('/admin/me'));
  assert.equal(cleared, 1);
  await assert.rejects(client('/admin/auth/logout', { method: 'POST' }));
  assert.equal(refreshCalls, 1);
});

test('duplicate bootstrap calls share one refresh request', async () => {
  let refreshCalls = 0;
  const coordinator = createAdminAuthSessionCoordinator(async <T>(path: string) => {
    assert.equal(path, '/admin/auth/refresh');
    refreshCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return session as T;
  });

  const [first, second] = await Promise.all([
    coordinator.bootstrap(),
    coordinator.bootstrap(),
  ]);

  assert.equal(refreshCalls, 1);
  assert.equal(first.accessToken, 'new-admin-token');
  assert.equal(second.user.isSystemAdmin, true);
});
