import assert from 'node:assert/strict';
import test from 'node:test';
import type { OrganizationSummary } from '@fashion-ais/types';
import {
  createOrganizationContextCoordinator,
  emptyOrganizationContext,
  loadOrganizationContext,
} from './organization-context';

const organizations: OrganizationSummary[] = [
  {
    id: 'organization-one',
    name: 'First Studio',
    slug: 'first-studio',
    role: 'OWNER',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'organization-two',
    name: 'Second Studio',
    slug: 'second-studio',
    role: 'MEMBER',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
];

test('loads organizations for an authenticated user and selects the only organization', async () => {
  const request = async <T>(path: string): Promise<T> => {
    assert.equal(path, '/organizations');
    return [organizations[0]] as T;
  };
  const state = await loadOrganizationContext(request);
  assert.equal(state.organizations.length, 1);
  assert.equal(state.currentOrganization?.id, 'organization-one');
  assert.equal(state.currentRole, 'OWNER');
});

test('selects the first organization when several are returned', async () => {
  const state = await loadOrganizationContext(
    async <T>() => organizations as T,
  );
  assert.equal(state.currentOrganization?.id, 'organization-one');
  assert.equal(state.currentRole, 'OWNER');
});

test('handles organization fetch failure without stale organization data', async () => {
  const state = await loadOrganizationContext(async () => {
    throw new Error('network failed');
  });
  assert.equal(state.status, 'error');
  assert.deepEqual(state.organizations, []);
  assert.equal(state.currentOrganization, null);
  assert.equal(state.currentRole, null);
  assert.equal(state.error, 'Unable to load organizations');
});

test('empty context clears organization state for logout or anonymous auth state', () => {
  assert.deepEqual(emptyOrganizationContext, {
    status: 'idle',
    organizations: [],
    currentOrganization: null,
    currentRole: null,
    error: null,
  });
});

test('loading and anonymous auth states never request organizations', async () => {
  let requests = 0;
  const coordinator = createOrganizationContextCoordinator();
  const request = async <T>(): Promise<T> => {
    requests += 1;
    return organizations as T;
  };

  const loading = await coordinator.load('loading', undefined, request);
  const anonymous = await coordinator.load('anonymous', undefined, request);

  assert.equal(requests, 0);
  assert.deepEqual(loading, emptyOrganizationContext);
  assert.deepEqual(anonymous, emptyOrganizationContext);
});

test('authenticated duplicate organization effects share one request', async () => {
  let requests = 0;
  const coordinator = createOrganizationContextCoordinator();
  const request = async <T>(): Promise<T> => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return organizations as T;
  };

  const [first, second] = await Promise.all([
    coordinator.load('authenticated', 'user-id', request),
    coordinator.load('authenticated', 'user-id', request),
  ]);

  assert.equal(requests, 1);
  assert.equal(first.currentOrganization?.id, 'organization-one');
  assert.equal(second.currentOrganization?.id, 'organization-one');
});

test('logout clear leaves anonymous organization state empty without reloading', async () => {
  let requests = 0;
  const coordinator = createOrganizationContextCoordinator();
  const request = async <T>(): Promise<T> => {
    requests += 1;
    return organizations as T;
  };

  await coordinator.load('authenticated', 'user-id', request);
  coordinator.clear();
  const state = await coordinator.load('anonymous', undefined, request);

  assert.equal(requests, 1);
  assert.deepEqual(state, emptyOrganizationContext);
});
