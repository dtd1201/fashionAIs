import type { ConfigService } from '@nestjs/config';

export interface RefreshCookieDefinition {
  name: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: string;
  };
}

export function refreshCookie(
  config: ConfigService,
  namespace: 'customer' | 'admin',
): RefreshCookieDefinition {
  const admin = namespace === 'admin';
  return {
    name: config.getOrThrow<string>(
      admin ? 'auth.adminRefreshCookieName' : 'auth.refreshCookieName',
    ),
    options: {
      httpOnly: true,
      secure: config.getOrThrow<boolean>('auth.secureCookies'),
      sameSite: 'lax',
      path: admin ? '/api/v1/admin/auth' : '/api/v1/auth',
    },
  };
}
