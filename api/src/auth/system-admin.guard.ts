import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class SystemAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().authUser;
    if (!user?.isSystemAdmin)
      throw new ForbiddenException('System administrator access required');
    return true;
  }
}
