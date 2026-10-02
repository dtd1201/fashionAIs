import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { SystemAdminGuard } from '../src/auth/system-admin.guard';

function contextFor(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('authorization guards', () => {
  it('protects routes without a valid access token', async () => {
    const guard = new JwtAuthGuard(new JwtService(), {} as ConfigService, {} as never);
    const request = { header: jest.fn().mockReturnValue(undefined) };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an inactive user with an otherwise valid access token', async () => {
    const jwt = new JwtService();
    const secret = 'access-secret-with-at-least-thirty-two-characters';
    const token = await jwt.signAsync(
      { sub: 'inactive-user', type: 'access' },
      { secret, expiresIn: '15m' },
    );
    const config = { getOrThrow: jest.fn().mockReturnValue(secret) } as unknown as ConfigService;
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inactive-user',
          email: 'inactive@example.com',
          displayName: null,
          status: 'INACTIVE',
          isSystemAdmin: false,
        }),
      },
    };
    const guard = new JwtAuthGuard(jwt, config, prisma as never);
    const request = { header: jest.fn().mockReturnValue(`Bearer ${token}`) };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows system admins', () => {
    const guard = new SystemAdminGuard();
    const context = contextFor({ authUser: { isSystemAdmin: true } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies normal customers from system admin routes', () => {
    const guard = new SystemAdminGuard();
    const context = contextFor({ authUser: { isSystemAdmin: false } });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
