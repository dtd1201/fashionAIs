import type { AuthUser } from '@fashion-ais/types';
import type { Request } from 'express';

export interface AccessTokenPayload {
  sub: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  type: 'refresh';
  context?: AuthSessionContext;
}

export type AuthSessionContext = 'customer' | 'admin';

export interface AuthenticatedRequest extends Request {
  authUser: AuthUser;
}

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}
