import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { Prisma, type User } from '@prisma/client';
import type { AuthTokenResponse, AuthUser } from '@fashion-ais/types';
import * as argon2 from 'argon2';
import { PrismaService } from '../database/prisma.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { RefreshTokenPayload, RequestMetadata } from './auth.types';

export interface AuthSessionResult extends AuthTokenResponse {
  refreshToken: string;
  refreshMaxAgeMs: number;
}

const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$CqX4i3aas+VMi/eqT81mnQ$oR50hf4l8ShCyACfL6oElenJXEUFJkK+ADfPTku4gKw';
const ORGANIZATION_SLUG_ATTEMPTS = 3;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(
    dto: RegisterDto,
    metadata: RequestMetadata,
  ): Promise<AuthSessionResult> {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    for (let attempt = 1; attempt <= ORGANIZATION_SLUG_ATTEMPTS; attempt += 1) {
      try {
        const user = await this.prisma.$transaction(async (transaction) => {
          const createdUser = await transaction.user.create({
            data: {
              email,
              passwordHash,
              displayName: dto.displayName?.trim() || null,
            },
          });
          const organization = await transaction.organization.create({
            data: {
              name: dto.organizationName.trim(),
              slug: this.createOrganizationSlug(dto.organizationName),
            },
          });
          await transaction.organizationMember.create({
            data: {
              userId: createdUser.id,
              organizationId: organization.id,
              role: 'OWNER',
            },
          });
          return createdUser;
        });
        return this.createSession(user, metadata);
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error;
        if (this.isUniqueTarget(error, 'User', 'email')) {
          throw new ConflictException({
            code: 'ACCOUNT_ALREADY_EXISTS',
            message: 'An account with this email already exists',
          });
        }
        if (
          this.isUniqueTarget(error, 'Organization', 'slug') &&
          attempt < ORGANIZATION_SLUG_ATTEMPTS
        ) {
          continue;
        }
        throw new InternalServerErrorException({
          code: 'REGISTRATION_FAILED',
          message: 'Unable to create account',
        });
      }
    }

    throw new InternalServerErrorException({
      code: 'REGISTRATION_FAILED',
      message: 'Unable to create account',
    });
  }

  async login(
    dto: LoginDto,
    metadata: RequestMetadata,
  ): Promise<AuthSessionResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    const passwordValid = user?.passwordHash
      ? await argon2.verify(user.passwordHash, dto.password)
      : await this.runDummyPasswordCheck(dto.password);

    if (!user || !passwordValid || user.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }
    return this.createSession(user, metadata);
  }

  async refresh(
    refreshToken: string | undefined,
    metadata: RequestMetadata,
  ): Promise<AuthSessionResult> {
    if (!refreshToken) throw this.invalidRefreshToken();

    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: this.config.getOrThrow<string>('auth.refreshSecret'),
        },
      );
      if (payload.type !== 'refresh') throw new Error('Invalid token type');

      const session = await this.prisma.authSession.findUnique({
        where: { id: payload.sid },
        include: { user: true },
      });
      if (
        !session ||
        session.userId !== payload.sub ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.user.status !== 'ACTIVE' ||
        !this.tokenHashesMatch(
          session.refreshTokenHash,
          this.hashToken(refreshToken),
        )
      ) {
        throw new Error('Invalid session');
      }

      return await this.rotateSession(session.id, session.user, metadata);
    } catch {
      throw this.invalidRefreshToken();
    }
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: this.config.getOrThrow<string>('auth.refreshSecret'),
          ignoreExpiration: true,
        },
      );
      await this.prisma.authSession.updateMany({
        where: { id: payload.sid, userId: payload.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Logout is idempotent; the cookie is cleared even when the token is invalid.
    }
  }

  private async createSession(
    user: User,
    metadata: RequestMetadata,
  ): Promise<AuthSessionResult> {
    const sessionId = randomUUID();
    const tokens = await this.createTokens(user, sessionId);
    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: this.hashToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + tokens.refreshMaxAgeMs),
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
      },
    });
    return { ...tokens, user: this.toAuthUser(user) };
  }

  private async rotateSession(
    currentSessionId: string,
    user: User,
    metadata: RequestMetadata,
  ): Promise<AuthSessionResult> {
    const nextSessionId = randomUUID();
    const tokens = await this.createTokens(user, nextSessionId);
    await this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.authSession.updateMany({
        where: { id: currentSessionId, revokedAt: null },
        data: { revokedAt: new Date(), replacedBySessionId: nextSessionId },
      });
      if (revoked.count !== 1) throw new Error('Session was already rotated');
      await transaction.authSession.create({
        data: {
          id: nextSessionId,
          userId: user.id,
          refreshTokenHash: this.hashToken(tokens.refreshToken),
          expiresAt: new Date(Date.now() + tokens.refreshMaxAgeMs),
          userAgent: metadata.userAgent,
          ipAddress: metadata.ipAddress,
        },
      });
    });
    return { ...tokens, user: this.toAuthUser(user) };
  }

  private async createTokens(
    user: User,
    sessionId: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    refreshMaxAgeMs: number;
  }> {
    const accessExpiresIn = this.config.getOrThrow<string>(
      'auth.accessExpiresIn',
    );
    const refreshExpiresIn = this.config.getOrThrow<string>(
      'auth.refreshExpiresIn',
    );
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: user.id, type: 'access' },
        {
          secret: this.config.getOrThrow<string>('auth.accessSecret'),
          expiresIn: accessExpiresIn as JwtSignOptions['expiresIn'],
        },
      ),
      this.jwt.signAsync(
        { sub: user.id, sid: sessionId, type: 'refresh' },
        {
          secret: this.config.getOrThrow<string>('auth.refreshSecret'),
          expiresIn: refreshExpiresIn as JwtSignOptions['expiresIn'],
        },
      ),
    ]);
    return {
      accessToken,
      refreshToken,
      refreshMaxAgeMs: this.durationToMilliseconds(refreshExpiresIn),
    };
  }

  private async runDummyPasswordCheck(password: string): Promise<boolean> {
    await argon2.verify(DUMMY_ARGON2_HASH, password);
    return false;
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private isUniqueTarget(
    error: Prisma.PrismaClientKnownRequestError,
    model: string,
    field: string,
  ): boolean {
    const modelName =
      typeof error.meta?.modelName === 'string'
        ? error.meta.modelName
        : undefined;
    const target = error.meta?.target;
    const fields = Array.isArray(target)
      ? target.filter((value): value is string => typeof value === 'string')
      : typeof target === 'string'
        ? [target]
        : [];
    const fieldMatched = fields.some(
      (value) =>
        value === field ||
        value.toLowerCase().includes(`${model}_${field}`.toLowerCase()),
    );
    return fieldMatched && (modelName === undefined || modelName === model);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private tokenHashesMatch(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(actual, 'hex');
    return (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }

  private durationToMilliseconds(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) throw new Error('Invalid token duration');
    const amount = Number(match[1]);
    const unit = match[2] as 's' | 'm' | 'h' | 'd';
    const multiplier = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
      unit
    ];
    return amount * multiplier;
  }

  private createOrganizationSlug(name: string): string {
    const base =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50) || 'organization';
    return `${base}-${randomUUID().slice(0, 8)}`;
  }

  private toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      isSystemAdmin: user.isSystemAdmin,
    };
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Session is invalid or expired',
    });
  }
}
