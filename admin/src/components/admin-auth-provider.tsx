'use client';

import type { AuthTokenResponse, AuthUser, LoginRequest } from '@fashion-ais/types';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AdminApiError, adminApiRequest, createAuthenticatedAdminApiClient } from '@/lib/api/client';
import { completeAdminSession } from '@/lib/auth/admin-session';

type AdminAuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'denied';

interface AdminAuthContextValue {
  status: AdminAuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  request<T>(path: string, init?: RequestInit): Promise<T>;
  login(input: LoginRequest): Promise<void>;
  logout(): Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminAuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  const acceptSession = useCallback((token: string, admin: AuthUser): void => {
    accessTokenRef.current = token;
    setAccessToken(token);
    setUser(admin);
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback((nextStatus: AdminAuthStatus = 'anonymous'): void => {
    accessTokenRef.current = null;
    setAccessToken(null);
    setUser(null);
    setStatus(nextStatus);
  }, []);

  const applyRefreshedSession = useCallback((session: AuthTokenResponse): void => {
    accessTokenRef.current = session.accessToken;
    setAccessToken(session.accessToken);
    setUser(session.user);
  }, []);

  /* eslint-disable react-hooks/refs -- The token ref is read only when a request executes. */
  const request = useMemo(
    () => createAuthenticatedAdminApiClient({
      getAccessToken: () => accessTokenRef.current,
      onSession: applyRefreshedSession,
      onAuthFailure: () => clearSession(),
    }),
    [applyRefreshedSession, clearSession],
  );
  /* eslint-enable react-hooks/refs */

  const verifyAdmin = useCallback(async (accessToken: string): Promise<AuthUser> => {
    return adminApiRequest<AuthUser>('/admin/me', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }, []);

  useEffect(() => {
    async function restoreSession(): Promise<void> {
      try {
        const session = await adminApiRequest<AuthTokenResponse>('/auth/refresh', { method: 'POST' });
        await completeAdminSession({
          session,
          verify: verifyAdmin,
          logout: () => adminApiRequest('/auth/logout', { method: 'POST' }),
          accept: acceptSession,
          deny: () => clearSession('denied'),
        });
      } catch (error) {
        if (!(error instanceof AdminApiError) || error.status !== 403) clearSession();
      }
    }

    void restoreSession();
  }, [acceptSession, clearSession, verifyAdmin]);

  async function login(input: LoginRequest): Promise<void> {
    const session = await adminApiRequest<AuthTokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await completeAdminSession({
      session,
      verify: verifyAdmin,
      logout: () => adminApiRequest('/auth/logout', { method: 'POST' }),
      accept: acceptSession,
      deny: () => clearSession('denied'),
    });
  }

  async function logout(): Promise<void> {
    try {
      await adminApiRequest<{ loggedOut: true }>('/auth/logout', { method: 'POST' });
    } finally {
      clearSession();
    }
  }

  const value: AdminAuthContextValue = { status, user, accessToken, request, login, logout };
  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return context;
}
