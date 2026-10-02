'use client';

import type {
  AuthTokenResponse,
  AuthUser,
  LoginRequest,
  OrganizationRole,
  OrganizationSummary,
  RegisterRequest,
} from '@fashion-ais/types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  apiRequest,
  authSessionCoordinator,
  createAuthenticatedApiClient,
} from '@/lib/api/client';
import {
  createOrganizationContextCoordinator,
  emptyOrganizationContext,
  type OrganizationStatus,
} from '@/lib/organization-context';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  organizationStatus: OrganizationStatus;
  organizations: OrganizationSummary[];
  currentOrganization: OrganizationSummary | null;
  currentRole: OrganizationRole | null;
  organizationError: string | null;
  request<T>(path: string, init?: RequestInit): Promise<T>;
  login(input: LoginRequest): Promise<void>;
  register(input: RegisterRequest): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [organizationContext, setOrganizationContext] = useState(
    emptyOrganizationContext,
  );
  const accessTokenRef = useRef<string | null>(null);
  const authOperationRef = useRef(0);
  const organizationCoordinatorRef = useRef(
    createOrganizationContextCoordinator(),
  );
  const userId = user?.id;

  const applySession = useCallback((session: AuthTokenResponse): void => {
    accessTokenRef.current = session.accessToken;
    setAccessToken(session.accessToken);
    setUser(session.user);
    setOrganizationContext((current) =>
      current.status === 'idle'
        ? { ...emptyOrganizationContext, status: 'loading' }
        : current,
    );
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback((): void => {
    authOperationRef.current += 1;
    accessTokenRef.current = null;
    organizationCoordinatorRef.current.clear();
    setAccessToken(null);
    setUser(null);
    setOrganizationContext(emptyOrganizationContext);
    setStatus('anonymous');
  }, []);

  /* eslint-disable react-hooks/refs -- The token ref is read only when a request executes. */
  const request = useMemo(
    () =>
      createAuthenticatedApiClient({
        getAccessToken: () => accessTokenRef.current,
        onSession: applySession,
        onAuthFailure: clearSession,
        refreshSession: authSessionCoordinator.refresh,
      }),
    [applySession, clearSession],
  );
  /* eslint-enable react-hooks/refs */

  useEffect(() => {
    const operation = authOperationRef.current;
    let active = true;
    async function restoreSession(): Promise<void> {
      try {
        const session = await authSessionCoordinator.bootstrap();
        if (active && operation === authOperationRef.current) {
          applySession(session);
        }
      } catch {
        if (active && operation === authOperationRef.current) clearSession();
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
  }, [applySession, clearSession]);

  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;

    let active = true;
    const operation = authOperationRef.current;
    void organizationCoordinatorRef.current
      .load(status, userId, request)
      .then((nextContext) => {
        if (active && operation === authOperationRef.current) {
          setOrganizationContext(nextContext);
        }
      });
    return () => {
      active = false;
    };
  }, [request, status, userId]);

  async function authenticate(
    path: '/auth/login' | '/auth/register',
    input: LoginRequest | RegisterRequest,
  ): Promise<void> {
    authOperationRef.current += 1;
    const session = await apiRequest<AuthTokenResponse>(path, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    organizationCoordinatorRef.current.clear();
    setOrganizationContext(emptyOrganizationContext);
    applySession(session);
  }

  async function logout(): Promise<void> {
    authOperationRef.current += 1;
    try {
      await apiRequest<{ loggedOut: true }>('/auth/logout', { method: 'POST' });
    } finally {
      clearSession();
    }
  }

  const value: AuthContextValue = {
    status,
    user,
    accessToken,
    organizationStatus: organizationContext.status,
    organizations: organizationContext.organizations,
    currentOrganization: organizationContext.currentOrganization,
    currentRole: organizationContext.currentRole,
    organizationError: organizationContext.error,
    request,
    login: (input) => authenticate('/auth/login', input),
    register: (input) => authenticate('/auth/register', input),
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
