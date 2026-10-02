import type { ApiResponse, AuthTokenResponse } from '@fashion-ais/types';
import { env } from '@/lib/env';

export class AdminApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export async function adminApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init.headers },
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
  request?: typeof adminApiRequest;
}

const AUTH_LIFECYCLE_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
]);

export function createAuthenticatedAdminApiClient(options: AuthenticatedAdminClientOptions) {
  const request = options.request ?? adminApiRequest;
  let refreshPromise: Promise<string> | null = null;

  async function refreshAccessToken(): Promise<string> {
    if (!refreshPromise) {
      refreshPromise = request<AuthTokenResponse>('/auth/refresh', { method: 'POST' })
        .then((session) => {
          options.onSession(session);
          return session.accessToken;
        })
        .catch((error: unknown) => {
          options.onAuthFailure();
          throw error;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  }

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
      const retryToken = currentToken && currentToken !== attemptedToken
        ? currentToken
        : await refreshAccessToken();
      return request<T>(path, withBearerToken(init, retryToken));
    }
  };
}

function withBearerToken(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return { ...init, headers };
}
