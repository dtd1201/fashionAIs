import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthController } from '../src/auth/auth.controller';

describe('AuthController logout', () => {
  it('revokes the refresh session and clears the HttpOnly cookie', async () => {
    const authService = { logout: jest.fn().mockResolvedValue(undefined) };
    const config = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'auth.refreshCookieName') return 'fashion_ais_refresh';
        if (key === 'auth.secureCookies') return false;
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as ConfigService;
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
  const config = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'auth.refreshCookieName') return 'fashion_ais_refresh';
      if (key === 'auth.secureCookies') return false;
      throw new Error(`Unexpected config key: ${key}`);
    }),
  } as unknown as ConfigService;

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
});
