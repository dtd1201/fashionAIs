import type { ApiResponse, AuthTokenResponse } from '@fashion-ais/types';
import { env } from '@/lib/env';

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    const error = body.success ? { code: 'HTTP_ERROR', message: 'Request failed' } : body.error;
    throw new ApiClientError(error.message, error.code, response.status, error.details);
  }
  return body.data;
}

interface AuthenticatedClientOptions {
  getAccessToken(): string | null;
  onSession(session: AuthTokenResponse): void;
  onAuthFailure(): void;
  refreshSession(): Promise<AuthTokenResponse>;
  request?: typeof apiRequest;
}

export interface AuthSessionCoordinator {
  refresh(): Promise<AuthTokenResponse>;
  bootstrap(): Promise<AuthTokenResponse>;
}

const AUTH_LIFECYCLE_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
]);

export function createAuthenticatedApiClient(options: AuthenticatedClientOptions) {
  const request = options.request ?? apiRequest;

  return async function authenticatedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const attemptedToken = options.getAccessToken();
    try {
      return await request<T>(path, withBearerToken(init, attemptedToken));
    } catch (error) {
      if (
        !(error instanceof ApiClientError) ||
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
        if (retryError instanceof ApiClientError && retryError.status === 401) {
          options.onAuthFailure();
        }
        throw retryError;
      }
    }
  };
}

export function createAuthSessionCoordinator(
  request: typeof apiRequest = apiRequest,
): AuthSessionCoordinator {
  let refreshPromise: Promise<AuthTokenResponse> | null = null;

  function refresh(): Promise<AuthTokenResponse> {
    if (!refreshPromise) {
      refreshPromise = request<AuthTokenResponse>('/auth/refresh', {
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

export const authSessionCoordinator = createAuthSessionCoordinator();

function withBearerToken(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return { ...init, headers };
}
