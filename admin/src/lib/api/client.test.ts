import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthTokenResponse } from '@fashion-ais/types';
import { AdminApiError, createAuthenticatedAdminApiClient } from './client';

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

test('admin requests share one refresh and retry once', async () => {
  let token: string | null = 'expired-admin-token';
  let refreshCalls = 0;
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    if (path === '/auth/refresh') {
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
    request,
  });

  await Promise.all([client('/admin/one'), client('/admin/two'), client('/admin/three')]);
  assert.equal(refreshCalls, 1);
});

test('admin refresh failure clears state and auth endpoints do not recurse', async () => {
  let token: string | null = 'expired-admin-token';
  let cleared = 0;
  let refreshCalls = 0;
  const request = async <T>(path: string): Promise<T> => {
    if (path === '/auth/refresh') refreshCalls += 1;
    throw new AdminApiError('unauthorized', 401);
  };
  const client = createAuthenticatedAdminApiClient({
    getAccessToken: () => token,
    onSession: () => undefined,
    onAuthFailure: () => { token = null; cleared += 1; },
    request,
  });

  await assert.rejects(client('/admin/me'));
  assert.equal(cleared, 1);
  await assert.rejects(client('/auth/logout', { method: 'POST' }));
  assert.equal(refreshCalls, 1);
});
