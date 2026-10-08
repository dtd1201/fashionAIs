import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AdminAuthController } from '../src/auth/admin-auth.controller';
import { AuthController } from '../src/auth/auth.controller';

const config = {
  getOrThrow: jest.fn((key: string) => {
    if (key === 'auth.refreshCookieName') return 'fashion_ais_refresh';
    if (key === 'auth.adminRefreshCookieName') return 'fashion_ais_admin_refresh';
    if (key === 'auth.secureCookies') return false;
    throw new Error(`Unexpected config key: ${key}`);
  }),
} as unknown as ConfigService;

describe('AuthController logout', () => {
  it('revokes the refresh session and clears the HttpOnly cookie', async () => {
    const authService = { logout: jest.fn().mockResolvedValue(undefined) };
    const controller = new AuthController(authService as never, config);
    const request = { cookies: { fashion_ais_refresh: 'refresh-token' } } as unknown as Request;
    const clearCookie = jest.fn();
    const response = { clearCookie } as unknown as Response;

    await expect(controller.logout(request, response)).resolves.toEqual({ loggedOut: true });
    expect(authService.logout).toHaveBeenCalledWith('refresh-token');
    expect(clearCookie).toHaveBeenCalledWith('fashion_ais_refresh', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/v1/auth',
    });
  });
});

describe('AuthController session cookies', () => {
  const session = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    refreshMaxAgeMs: 2_592_000_000,
    user: {
      id: 'user-id',
      email: 'owner@example.com',
      displayName: null,
      status: 'ACTIVE' as const,
      isSystemAdmin: false,
    },
  };
  it.each(['login', 'refresh'] as const)(
    '%s returns the access session and sets the scoped HttpOnly refresh cookie',
    async (method) => {
      const authService = {
        [method]: jest.fn().mockResolvedValue(session),
      };
      const controller = new AuthController(authService as never, config);
      const cookie = jest.fn();
      const response = { cookie } as unknown as Response;
      const request = {
        cookies: { fashion_ais_refresh: 'current-refresh-token' },
        ip: '127.0.0.1',
        header: jest.fn().mockReturnValue('test-agent'),
      } as unknown as Request;

      const result = method === 'login'
        ? await controller.login(
            { email: 'owner@example.com', password: 'correct-password' },
            request,
            response,
          )
        : await controller.refresh(request, response);

      expect(result).toEqual({ accessToken: session.accessToken, user: session.user });
      expect(cookie).toHaveBeenCalledWith(
        'fashion_ais_refresh',
        session.refreshToken,
        {
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/api/v1/auth',
          maxAge: session.refreshMaxAgeMs,
        },
      );
    },
  );

  it('refresh reads only the customer cookie when both cookies exist', async () => {
    const authService = { refresh: jest.fn().mockResolvedValue(session) };
    const controller = new AuthController(authService as never, config);
    const request = {
      cookies: {
        fashion_ais_refresh: 'customer-token',
        fashion_ais_admin_refresh: 'admin-token',
      },
      header: jest.fn(),
    } as unknown as Request;

    await controller.refresh(request, { cookie: jest.fn() } as unknown as Response);

    expect(authService.refresh).toHaveBeenCalledWith(
      'customer-token',
      expect.any(Object),
    );
  });
});

describe('AdminAuthController session cookies', () => {
  const session = {
    accessToken: 'admin-access-token',
    refreshToken: 'admin-refresh-token',
    refreshMaxAgeMs: 2_592_000_000,
    user: {
      id: 'admin-id',
      email: 'admin@example.com',
      displayName: null,
      status: 'ACTIVE' as const,
      isSystemAdmin: true,
    },
  };

  it.each(['login', 'refresh'] as const)(
    '%s sets only the admin refresh cookie',
    async (method) => {
      const authService = {
        loginAdmin: jest.fn().mockResolvedValue(session),
        refresh: jest.fn().mockResolvedValue(session),
      };
      const controller = new AdminAuthController(authService as never, config);
      const cookie = jest.fn();
      const request = {
        cookies: {
          fashion_ais_refresh: 'customer-token',
          fashion_ais_admin_refresh: 'current-admin-token',
        },
        ip: '127.0.0.1',
        header: jest.fn().mockReturnValue('test-agent'),
      } as unknown as Request;

      const result = method === 'login'
        ? await controller.login(
            { email: 'admin@example.com', password: 'correct-password' },
            request,
            { cookie } as unknown as Response,
          )
        : await controller.refresh(request, { cookie } as unknown as Response);

      expect(result.user.isSystemAdmin).toBe(true);
      expect(cookie).toHaveBeenCalledWith(
        'fashion_ais_admin_refresh',
        session.refreshToken,
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/api/v1/admin/auth',
        }),
      );
      expect(cookie).not.toHaveBeenCalledWith(
        'fashion_ais_refresh',
        expect.anything(),
        expect.anything(),
      );
      if (method === 'refresh') {
        expect(authService.refresh).toHaveBeenCalledWith(
          'current-admin-token',
          expect.any(Object),
          'admin',
        );
      }
    },
  );

  it('logout revokes and clears only the admin session cookie', async () => {
    const authService = { logout: jest.fn().mockResolvedValue(undefined) };
    const controller = new AdminAuthController(authService as never, config);
    const clearCookie = jest.fn();
    const request = {
      cookies: {
        fashion_ais_refresh: 'customer-token',
        fashion_ais_admin_refresh: 'admin-token',
      },
    } as unknown as Request;

    await controller.logout(request, { clearCookie } as unknown as Response);

    expect(authService.logout).toHaveBeenCalledWith('admin-token', 'admin');
    expect(clearCookie).toHaveBeenCalledWith(
      'fashion_ais_admin_refresh',
      expect.objectContaining({ path: '/api/v1/admin/auth' }),
    );
    expect(clearCookie).not.toHaveBeenCalledWith(
      'fashion_ais_refresh',
      expect.anything(),
    );
  });
});
