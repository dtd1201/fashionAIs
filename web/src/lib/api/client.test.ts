import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthTokenResponse } from '@fashion-ais/types';
import {
  ApiClientError,
  apiRequest,
  createAuthenticatedApiClient,
  createAuthSessionCoordinator,
} from './client';

const session: AuthTokenResponse = {
  accessToken: 'new-token',
  user: {
    id: 'user-id',
    email: 'user@example.com',
    displayName: null,
    status: 'ACTIVE',
    isSystemAdmin: false,
  },
};

function successResponse<T>(data: T): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('all API requests include browser-managed credentials', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = (async (_input, init) => {
    assert.equal(init?.credentials, 'include');
    return successResponse({ ok: true });
  }) as typeof fetch;

  assert.deepEqual(await apiRequest<{ ok: true }>('/health'), { ok: true });
});

test('preserves Authorization from a Headers instance', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = (async (_input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer access-token');
    return successResponse({ ok: true });
  }) as typeof fetch;

  await apiRequest('/protected', {
    headers: new Headers({ authorization: 'Bearer access-token' }),
  });
});

test('preserves plain-object headers and adds JSON content type for string bodies', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = (async (_input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('x-request-id'), 'request-id');
    assert.equal(headers.get('content-type'), 'application/json');
    return successResponse({ ok: true });
  }) as typeof fetch;

  await apiRequest('/example', {
    method: 'POST',
    headers: { 'x-request-id': 'request-id' },
    body: JSON.stringify({ value: true }),
  });
});

test('preserves a caller-provided Content-Type', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = (async (_input, init) => {
    assert.equal(
      new Headers(init?.headers).get('content-type'),
      'application/merge-patch+json',
    );
    return successResponse({ ok: true });
  }) as typeof fetch;

  await apiRequest('/example', {
    method: 'PATCH',
    headers: { 'content-type': 'application/merge-patch+json' },
    body: JSON.stringify({ value: true }),
  });
});

test('does not force application/json onto FormData', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = (async (_input, init) => {
    assert.equal(new Headers(init?.headers).has('content-type'), false);
    return successResponse({ ok: true });
  }) as typeof fetch;
  const body = new FormData();
  body.set('file', new Blob(['image']), 'image.jpg');

  await apiRequest('/example', { method: 'POST', body });
});

test('authenticated requests send the current Bearer token through apiRequest', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = (async (_input, init) => {
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      'Bearer access-token',
    );
    return successResponse({ ok: true });
  }) as typeof fetch;
  const client = createAuthenticatedApiClient({
    getAccessToken: () => 'access-token',
    onSession: () => undefined,
    onAuthFailure: () => undefined,
    refreshSession: async () => session,
  });

  await client('/protected');
});

test('401 retry sends the refreshed Bearer token through apiRequest', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const authorizations: Array<string | null> = [];
  globalThis.fetch = (async (_input, init) => {
    const authorization = new Headers(init?.headers).get('authorization');
    authorizations.push(authorization);
    if (authorization === 'Bearer expired-token') {
      return new Response(JSON.stringify({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Expired' },
      }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    return successResponse({ ok: true });
  }) as typeof fetch;
  let token: string | null = 'expired-token';
  const client = createAuthenticatedApiClient({
    getAccessToken: () => token,
    onSession: (next) => { token = next.accessToken; },
    onAuthFailure: () => { token = null; },
    refreshSession: async () => session,
  });

  await client('/protected');
  assert.deepEqual(authorizations, [
    'Bearer expired-token',
    'Bearer new-token',
  ]);
});

test('refreshes once and retries the original request', async () => {
  let token: string | null = 'expired-token';
  let protectedCalls = 0;
  let refreshCalls = 0;
  const request = async <T>(path: string): Promise<T> => {
    if (path === '/auth/refresh') {
      refreshCalls += 1;
      return session as T;
    }
    protectedCalls += 1;
    if (protectedCalls === 1) throw new ApiClientError('expired', 'UNAUTHENTICATED', 401);
    return { ok: true } as T;
  };
  const client = createAuthenticatedApiClient({
    getAccessToken: () => token,
    onSession: (next) => { token = next.accessToken; },
    onAuthFailure: () => { token = null; },
    refreshSession: createAuthSessionCoordinator(request).refresh,
    request,
  });

  assert.deepEqual(await client('/protected'), { ok: true });
  assert.equal(refreshCalls, 1);
  assert.equal(protectedCalls, 2);
});

test('uses one refresh for simultaneous 401 responses', async () => {
  let token: string | null = 'expired-token';
  let refreshCalls = 0;
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    if (path === '/auth/refresh') {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return session as T;
    }
    const authorization = new Headers(init?.headers).get('authorization');
    if (authorization === 'Bearer expired-token') {
      throw new ApiClientError('expired', 'UNAUTHENTICATED', 401);
    }
    return { ok: true } as T;
  };
  const client = createAuthenticatedApiClient({
    getAccessToken: () => token,
    onSession: (next) => { token = next.accessToken; },
    onAuthFailure: () => { token = null; },
    refreshSession: createAuthSessionCoordinator(request).refresh,
    request,
  });

  await Promise.all([client('/one'), client('/two'), client('/three')]);
  assert.equal(refreshCalls, 1);
});

test('clears auth after refresh failure and never refreshes auth lifecycle endpoints', async () => {
  let token: string | null = 'expired-token';
  let cleared = 0;
  let refreshCalls = 0;
  const request = async <T>(path: string): Promise<T> => {
    if (path === '/auth/refresh') {
      refreshCalls += 1;
      throw new ApiClientError('invalid refresh', 'INVALID_REFRESH_TOKEN', 401);
    }
    throw new ApiClientError('unauthorized', 'UNAUTHENTICATED', 401);
  };
  const client = createAuthenticatedApiClient({
    getAccessToken: () => token,
    onSession: () => undefined,
    onAuthFailure: () => { token = null; cleared += 1; },
    refreshSession: createAuthSessionCoordinator(request).refresh,
    request,
  });

  await assert.rejects(client('/protected'));
  assert.equal(cleared, 1);
  await assert.rejects(client('/auth/login', { method: 'POST' }));
  assert.equal(refreshCalls, 1);
});

test('Strict Mode-like duplicate bootstrap calls share one refresh', async () => {
  let refreshCalls = 0;
  const coordinator = createAuthSessionCoordinator(async <T>(path: string) => {
    assert.equal(path, '/auth/refresh');
    refreshCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return session as T;
  });

  const [first, second] = await Promise.all([
    coordinator.bootstrap(),
    coordinator.bootstrap(),
  ]);

  assert.equal(refreshCalls, 1);
  assert.equal(first.accessToken, 'new-token');
  assert.equal(second.user.email, 'user@example.com');
});

test('duplicate failed bootstrap calls share one in-flight request', async () => {
  let refreshCalls = 0;
  const coordinator = createAuthSessionCoordinator(async () => {
    refreshCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    throw new ApiClientError('invalid refresh', 'INVALID_REFRESH_TOKEN', 401);
  });

  await Promise.all([
    assert.rejects(coordinator.bootstrap()),
    assert.rejects(coordinator.bootstrap()),
  ]);
  assert.equal(refreshCalls, 1);
});

test('bootstrap does not reuse a completed stale session', async () => {
  let refreshCalls = 0;
  const coordinator = createAuthSessionCoordinator(async <T>() => {
    refreshCalls += 1;
    return session as T;
  });

  await coordinator.bootstrap();
  await coordinator.bootstrap();
  assert.equal(refreshCalls, 2);
});

test('a protected retry that is still unauthorized clears local auth state', async () => {
  let token: string | null = 'expired-token';
  let cleared = 0;
  const request = async <T>(path: string): Promise<T> => {
    if (path === '/auth/refresh') return session as T;
    throw new ApiClientError('unauthorized', 'UNAUTHENTICATED', 401);
  };
  const client = createAuthenticatedApiClient({
    getAccessToken: () => token,
    onSession: (next) => { token = next.accessToken; },
    onAuthFailure: () => { token = null; cleared += 1; },
    refreshSession: createAuthSessionCoordinator(request).refresh,
    request,
  });

  await assert.rejects(client('/organizations'));
  assert.equal(token, null);
  assert.equal(cleared, 1);
});
