/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, type User } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from '../src/auth/auth.service';

const configValues: Record<string, unknown> = {
  'auth.accessSecret': 'access-secret-with-at-least-thirty-two-characters',
  'auth.refreshSecret': 'refresh-secret-with-at-least-thirty-two-characters',
  'auth.accessExpiresIn': '15m',
  'auth.refreshExpiresIn': '30d',
};

const activeUser = (passwordHash: string, isSystemAdmin = false): User => ({
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@example.com',
  displayName: 'Owner',
  passwordHash,
  status: 'ACTIVE',
  isSystemAdmin,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('AuthService', () => {
  const jwt = new JwtService();
  const config = { getOrThrow: jest.fn((key: string) => configValues[key]) } as unknown as ConfigService;

  it('registers a user with an organization and OWNER membership', async () => {
    const user = activeUser('generated-hash');
    const transaction = {
      user: { create: jest.fn().mockResolvedValue(user) },
      organization: {
        create: jest.fn().mockResolvedValue({ id: '22222222-2222-4222-8222-222222222222' }),
      },
      organizationMember: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof transaction) => unknown) => callback(transaction)),
      authSession: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new AuthService(prisma as never, jwt, config);

    const result = await service.register(
      {
        email: 'OWNER@EXAMPLE.COM',
        password: 'correct-password',
        displayName: 'Owner',
        organizationName: 'Example Studio',
      },
      {},
    );

    expect(transaction.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'owner@example.com' }) }),
    );
    expect(transaction.organizationMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: 'OWNER', userId: user.id }),
    });
    expect(result.accessToken).toEqual(expect.any(String));
  });

  it('rejects duplicate registration emails', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '6.12.0',
          meta: { modelName: 'User', target: ['email'] },
        }),
      ),
    };
    const service = new AuthService(prisma as never, jwt, config);
    await expect(
      service.register(
        { email: 'owner@example.com', password: 'correct-password', organizationName: 'Studio' },
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('retries an organization slug collision without misreporting duplicate email', async () => {
    const user = activeUser('generated-hash');
    const transaction = {
      user: { create: jest.fn().mockResolvedValue(user) },
      organization: { create: jest.fn().mockResolvedValue({ id: 'organization-id' }) },
      organizationMember: { create: jest.fn().mockResolvedValue({}) },
    };
    const slugCollision = new Prisma.PrismaClientKnownRequestError('duplicate slug', {
      code: 'P2002',
      clientVersion: '6.12.0',
      meta: { modelName: 'Organization', target: ['slug'] },
    });
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce(slugCollision)
        .mockImplementation((callback: (client: typeof transaction) => unknown) => callback(transaction)),
      authSession: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new AuthService(prisma as never, jwt, config);

    await expect(
      service.register(
        { email: 'owner@example.com', password: 'correct-password', organizationName: 'Studio' },
        {},
      ),
    ).resolves.toEqual(expect.objectContaining({ user: expect.objectContaining({ id: user.id }) }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('logs in with a valid password and rejects an invalid password generically', async () => {
    const passwordHash = await argon2.hash('correct-password');
    const user = activeUser(passwordHash);
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      authSession: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new AuthService(prisma as never, jwt, config);

    await expect(
      service.login({ email: user.email, password: 'correct-password' }, {}),
    ).resolves.toEqual(expect.objectContaining({ user: expect.objectContaining({ id: user.id }) }));
    await expect(
      service.login({ email: user.email, password: 'wrong-password' }, {}),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }) });
  });

  it('returns the same generic error for a nonexistent email', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new AuthService(prisma as never, jwt, config);
    await expect(
      service.login({ email: 'missing@example.com', password: 'wrong-password' }, {}),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }) });
  });

  it('rejects a non-system-admin account from admin login', async () => {
    const passwordHash = await argon2.hash('correct-password');
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(activeUser(passwordHash)) },
    };
    const service = new AuthService(prisma as never, jwt, config);

    await expect(
      service.loginAdmin(
        { email: 'owner@example.com', password: 'correct-password' },
        {},
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    });
  });

  it('binds customer and admin refresh tokens to separate contexts', async () => {
    const passwordHash = await argon2.hash('correct-password');
    const customerUser = activeUser(passwordHash);
    const adminUser = {
      ...activeUser(passwordHash, true),
      id: '22222222-2222-4222-8222-222222222222',
      email: 'admin@example.com',
    };
    const sessions = new Map<string, Record<string, unknown>>();
    const prisma = {
      user: {
        findUnique: jest.fn(({ where }: { where: { email: string } }) =>
          Promise.resolve(
            where.email === adminUser.email ? adminUser : customerUser,
          ),
        ),
      },
      authSession: {
        create: jest.fn(({
          data,
        }: {
          data: Record<string, unknown> & { id: string; userId: string };
        }) => {
          const user = data.userId === adminUser.id ? adminUser : customerUser;
          sessions.set(data.id, { ...data, revokedAt: null, user });
          return Promise.resolve(data);
        }),
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(sessions.get(where.id) ?? null),
        ),
      },
    };
    const service = new AuthService(prisma as never, jwt, config);
    const customer = await service.login(
      { email: customerUser.email, password: 'correct-password' },
      {},
    );
    const admin = await service.loginAdmin(
      { email: adminUser.email, password: 'correct-password' },
      {},
    );

    expect(sessions.size).toBe(2);
    expect(customer.user.id).toBe(customerUser.id);
    expect(admin.user.id).toBe(adminUser.id);
    await expect(service.refresh(customer.refreshToken, {}, 'admin')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_REFRESH_TOKEN' }),
    });
    await expect(service.refresh(admin.refreshToken, {}, 'customer')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_REFRESH_TOKEN' }),
    });
  });

  it('strictly rotates admin refresh sessions', async () => {
    const passwordHash = await argon2.hash('correct-password');
    const user = activeUser(passwordHash, true);
    let storedSession: {
      id: string;
      userId: string;
      refreshTokenHash: string;
      expiresAt: Date;
      revokedAt: Date | null;
    } | undefined;
    const transaction = {
      authSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      authSession: {
        create: jest.fn(({ data }) => {
          storedSession = { ...data, revokedAt: null };
          return Promise.resolve(storedSession);
        }),
        findUnique: jest.fn(() =>
          Promise.resolve(storedSession ? { ...storedSession, user } : null),
        ),
      },
      $transaction: jest.fn((callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new AuthService(prisma as never, jwt, config);
    const login = await service.loginAdmin(
      { email: user.email, password: 'correct-password' },
      {},
    );

    await expect(service.refresh(login.refreshToken, {}, 'admin')).resolves.toEqual(
      expect.objectContaining({ refreshToken: expect.any(String) }),
    );
    transaction.authSession.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.refresh(login.refreshToken, {}, 'admin')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_REFRESH_TOKEN' }),
    });
  });

  it('rejects an admin refresh after system-admin access is revoked', async () => {
    const passwordHash = await argon2.hash('correct-password');
    const user = activeUser(passwordHash, true);
    let storedSession: Record<string, unknown> | undefined;
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      authSession: {
        create: jest.fn(({ data }) => {
          storedSession = { ...data, revokedAt: null };
          return Promise.resolve(data);
        }),
        findUnique: jest.fn(() =>
          Promise.resolve(storedSession ? { ...storedSession, user } : null),
        ),
      },
    };
    const service = new AuthService(prisma as never, jwt, config);
    const login = await service.loginAdmin(
      { email: user.email, password: 'correct-password' },
      {},
    );
    user.isSystemAdmin = false;

    await expect(service.refresh(login.refreshToken, {}, 'admin')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_REFRESH_TOKEN' }),
    });
  });

  it('rotates a refresh token and revokes the old session', async () => {
    const passwordHash = await argon2.hash('correct-password');
    const user = activeUser(passwordHash);
    let storedSession: { id: string; userId: string; refreshTokenHash: string; expiresAt: Date; revokedAt: Date | null } | undefined;
    const transaction = {
      authSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      authSession: {
        create: jest.fn(({ data }) => {
          storedSession = { ...data, revokedAt: null };
          return Promise.resolve(storedSession);
        }),
        findUnique: jest.fn(() => Promise.resolve(storedSession ? { ...storedSession, user } : null)),
      },
      $transaction: jest.fn((callback: (client: typeof transaction) => unknown) => callback(transaction)),
    };
    const service = new AuthService(prisma as never, jwt, config);
    const login = await service.login({ email: user.email, password: 'correct-password' }, {});
    const refreshed = await service.refresh(login.refreshToken, {});

    expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );

    transaction.authSession.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.refresh(login.refreshToken, {})).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_REFRESH_TOKEN' }),
    });
  });

  it('revokes the current refresh session on logout', async () => {
    const token = await jwt.signAsync(
      { sub: '11111111-1111-4111-8111-111111111111', sid: 'session-id', type: 'refresh' },
      { secret: configValues['auth.refreshSecret'] as string, expiresIn: '30d' },
    );
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new AuthService({ authSession: { updateMany } } as never, jwt, config);
    await service.logout(token);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'session-id' }) }),
    );
  });

  it('rejects refresh after logout revoked the session', async () => {
    const passwordHash = await argon2.hash('correct-password');
    const user = activeUser(passwordHash);
    let storedSession: {
      id: string;
      userId: string;
      refreshTokenHash: string;
      expiresAt: Date;
      revokedAt: Date | null;
    } | undefined;
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      authSession: {
        create: jest.fn(({ data }) => {
          storedSession = { ...data, revokedAt: null };
          return Promise.resolve(storedSession);
        }),
        updateMany: jest.fn(() => {
          if (storedSession) storedSession.revokedAt = new Date();
          return Promise.resolve({ count: 1 });
        }),
        findUnique: jest.fn(() => Promise.resolve(storedSession ? { ...storedSession, user } : null)),
      },
    };
    const service = new AuthService(prisma as never, jwt, config);
    const login = await service.login({ email: user.email, password: 'correct-password' }, {});

    await service.logout(login.refreshToken);
    await expect(service.refresh(login.refreshToken, {})).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_REFRESH_TOKEN' }),
    });
  });
});
