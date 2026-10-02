import type { OrganizationRole, OrganizationSummary } from '@fashion-ais/types';

export type OrganizationStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface OrganizationContextState {
  status: OrganizationStatus;
  organizations: OrganizationSummary[];
  currentOrganization: OrganizationSummary | null;
  currentRole: OrganizationRole | null;
  error: string | null;
}

export const emptyOrganizationContext: OrganizationContextState = {
  status: 'idle',
  organizations: [],
  currentOrganization: null,
  currentRole: null,
  error: null,
};

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface OrganizationContextCoordinator {
  load(
    status: AuthStatus,
    userId: string | undefined,
    request: <T>(path: string, init?: RequestInit) => Promise<T>,
  ): Promise<OrganizationContextState>;
  clear(): void;
}

export function createOrganizationContextCoordinator(): OrganizationContextCoordinator {
  let inFlight: {
    userId: string;
    promise: Promise<OrganizationContextState>;
  } | null = null;

  return {
    load(status, userId, request) {
      if (status !== 'authenticated' || !userId) {
        return Promise.resolve(emptyOrganizationContext);
      }
      if (inFlight?.userId !== userId) {
        inFlight = { userId, promise: loadOrganizationContext(request) };
      }
      return inFlight.promise;
    },
    clear() {
      inFlight = null;
    },
  };
}

export async function loadOrganizationContext(
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
): Promise<OrganizationContextState> {
  try {
    const organizations =
      await request<OrganizationSummary[]>('/organizations');
    // Organization switching and persisted selection are intentionally deferred.
    const currentOrganization = organizations[0] ?? null;
    return {
      status: 'ready',
      organizations,
      currentOrganization,
      currentRole: currentOrganization?.role ?? null,
      error: null,
    };
  } catch {
    return {
      ...emptyOrganizationContext,
      status: 'error',
      error: 'Unable to load organizations',
    };
  }
}
