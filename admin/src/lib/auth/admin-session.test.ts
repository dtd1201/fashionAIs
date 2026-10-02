import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthTokenResponse } from '@fashion-ais/types';
import { AdminApiError } from '@/lib/api/client';
import { completeAdminSession } from './admin-session';

const customerSession: AuthTokenResponse = {
  accessToken: 'customer-token',
  user: {
    id: 'customer-id',
    email: 'customer@example.com',
    displayName: null,
    status: 'ACTIVE',
    isSystemAdmin: false,
  },
};

test('denied admin login logs out and clears state before reporting access denied', async () => {
  let logoutCalls = 0;
  let denied = false;
  let accepted = false;

  await assert.rejects(
    completeAdminSession({
      session: customerSession,
      verify: () => Promise.reject(new AdminApiError('forbidden', 403)),
      logout: () => { logoutCalls += 1; return Promise.resolve(); },
      accept: () => { accepted = true; },
      deny: () => { denied = true; },
    }),
    (error: unknown) => error instanceof AdminApiError && error.status === 403,
  );

  assert.equal(logoutCalls, 1);
  assert.equal(denied, true);
  assert.equal(accepted, false);
});
