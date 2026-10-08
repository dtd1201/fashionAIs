import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { AuthTokenResponse } from '@fashion-ais/types';
import type { Request, Response } from 'express';
import { refreshCookie } from './auth-cookie';
import { AuthService, type AuthSessionResult } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponse> {
    return this.finishAuthentication(
      await this.authService.loginAdmin(dto, this.requestMetadata(request)),
      response,
    );
  }

  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponse> {
    const cookie = this.cookie();
    return this.finishAuthentication(
      await this.authService.refresh(
        request.cookies?.[cookie.name] as string | undefined,
        this.requestMetadata(request),
        'admin',
      ),
      response,
    );
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ loggedOut: true }> {
    const cookie = this.cookie();
    await this.authService.logout(
      request.cookies?.[cookie.name] as string | undefined,
      'admin',
    );
    response.clearCookie(cookie.name, cookie.options);
    return { loggedOut: true };
  }

  private finishAuthentication(
    result: AuthSessionResult,
    response: Response,
  ): AuthTokenResponse {
    const cookie = this.cookie();
    response.cookie(cookie.name, result.refreshToken, {
      ...cookie.options,
      maxAge: result.refreshMaxAgeMs,
    });
    return { accessToken: result.accessToken, user: result.user };
  }

  private cookie() {
    return refreshCookie(this.config, 'admin');
  }

  private requestMetadata(request: Request): {
    ipAddress?: string;
    userAgent?: string;
  } {
    return { ipAddress: request.ip, userAgent: request.header('user-agent') };
  }
}
