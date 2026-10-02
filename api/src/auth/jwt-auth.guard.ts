import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser } from '@fashion-ais/types';
import { PrismaService } from '../database/prisma.service';
import type { AccessTokenPayload, AuthenticatedRequest } from './auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header('authorization');
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    if (!token) throw new UnauthorizedException('Authentication required');

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('auth.accessSecret'),
      });
      if (payload.type !== 'access') throw new Error('Invalid token type');
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || user.status !== 'ACTIVE') throw new Error('Inactive user');
      request.authUser = this.toAuthUser(user);
      return true;
    } catch {
      throw new UnauthorizedException('Authentication required');
    }
  }

  private toAuthUser(user: {
    id: string;
    email: string;
    displayName: string | null;
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    isSystemAdmin: boolean;
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      isSystemAdmin: user.isSystemAdmin,
    };
  }
}
