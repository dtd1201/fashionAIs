import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { AuthTokenResponse, AuthUser } from '@fashion-ais/types';
import type { Request, Response } from 'express';
import { AuthService, type AuthSessionResult } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponse> {
    return this.finishAuthentication(
      await this.authService.register(dto, this.requestMetadata(request)),
      response,
    );
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponse> {
    return this.finishAuthentication(
      await this.authService.login(dto, this.requestMetadata(request)),
      response,
    );
  }

  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponse> {
    return this.finishAuthentication(
      await this.authService.refresh(
        request.cookies?.[this.cookieName()] as string | undefined,
        this.requestMetadata(request),
      ),
      response,
    );
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ loggedOut: true }> {
    await this.authService.logout(
      request.cookies?.[this.cookieName()] as string | undefined,
    );
    response.clearCookie(this.cookieName(), this.cookieOptions());
    return { loggedOut: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  private finishAuthentication(
    result: AuthSessionResult,
    response: Response,
  ): AuthTokenResponse {
    response.cookie(this.cookieName(), result.refreshToken, {
      ...this.cookieOptions(),
      maxAge: result.refreshMaxAgeMs,
    });
    return { accessToken: result.accessToken, user: result.user };
  }

  private cookieName(): string {
    return this.config.getOrThrow<string>('auth.refreshCookieName');
  }

  private cookieOptions(): {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: string;
  } {
    return {
      httpOnly: true,
      secure: this.config.getOrThrow<boolean>('auth.secureCookies'),
      sameSite: 'lax',
      path: '/api/v1/auth',
    };
  }

  private requestMetadata(request: Request): {
    ipAddress?: string;
    userAgent?: string;
  } {
    return { ipAddress: request.ip, userAgent: request.header('user-agent') };
  }
}
