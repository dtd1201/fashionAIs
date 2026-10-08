import type { ApiResponse, AuthTokenResponse } from '@fashion-ais/types';
import { env } from '@/lib/env';

export class AdminApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export async function adminApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !body.success) {
    throw new AdminApiError(body.success ? 'Admin API request failed' : body.error.message, response.status);
  }
  return body.data;
}

interface AuthenticatedAdminClientOptions {
  getAccessToken(): string | null;
  onSession(session: AuthTokenResponse): void;
  onAuthFailure(): void;
  refreshSession(): Promise<AuthTokenResponse>;
  request?: typeof adminApiRequest;
}

export interface AdminAuthSessionCoordinator {
  refresh(): Promise<AuthTokenResponse>;
  bootstrap(): Promise<AuthTokenResponse>;
}

const AUTH_LIFECYCLE_PATHS = new Set([
  '/admin/auth/login',
  '/admin/auth/refresh',
  '/admin/auth/logout',
]);

export function createAuthenticatedAdminApiClient(options: AuthenticatedAdminClientOptions) {
  const request = options.request ?? adminApiRequest;

  return async function authenticatedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const attemptedToken = options.getAccessToken();
    try {
      return await request<T>(path, withBearerToken(init, attemptedToken));
    } catch (error) {
      if (
        !(error instanceof AdminApiError) ||
        error.status !== 401 ||
        !attemptedToken ||
        AUTH_LIFECYCLE_PATHS.has(path)
      ) {
        throw error;
      }

      const currentToken = options.getAccessToken();
      let retryToken = currentToken && currentToken !== attemptedToken
        ? currentToken
        : null;
      if (!retryToken) {
        try {
          const session = await options.refreshSession();
          options.onSession(session);
          retryToken = session.accessToken;
        } catch (refreshError) {
          options.onAuthFailure();
          throw refreshError;
        }
      }
      try {
        return await request<T>(path, withBearerToken(init, retryToken));
      } catch (retryError) {
        if (retryError instanceof AdminApiError && retryError.status === 401) {
          options.onAuthFailure();
        }
        throw retryError;
      }
    }
  };
}

export function createAdminAuthSessionCoordinator(
  request: typeof adminApiRequest = adminApiRequest,
): AdminAuthSessionCoordinator {
  let refreshPromise: Promise<AuthTokenResponse> | null = null;

  function refresh(): Promise<AuthTokenResponse> {
    if (!refreshPromise) {
      refreshPromise = request<AuthTokenResponse>('/admin/auth/refresh', {
        method: 'POST',
      }).finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  return {
    refresh,
    bootstrap() {
      return refresh();
    },
  };
}

export const adminAuthSessionCoordinator = createAdminAuthSessionCoordinator();

function withBearerToken(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return { ...init, headers };
}
