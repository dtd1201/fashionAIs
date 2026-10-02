import type { AuthTokenResponse, AuthUser } from '@fashion-ais/types';
import { AdminApiError } from '@/lib/api/client';

interface CompleteAdminSessionOptions {
  session: AuthTokenResponse;
  verify(accessToken: string): Promise<AuthUser>;
  logout(): Promise<unknown>;
  accept(accessToken: string, user: AuthUser): void;
  deny(): void;
}

export async function completeAdminSession(options: CompleteAdminSessionOptions): Promise<void> {
  try {
    const admin = await options.verify(options.session.accessToken);
    options.accept(options.session.accessToken, admin);
  } catch (error) {
    if (!(error instanceof AdminApiError) || error.status !== 403) throw error;
    try {
      await options.logout();
    } catch {
      // Local auth state must still be denied if cleanup cannot reach the API.
    } finally {
      options.deny();
    }
    throw new AdminApiError('This account does not have system administrator access', 403);
  }
}
