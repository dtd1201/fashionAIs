import type { CreditLedgerEntryType, OrganizationRole } from '@fashion-ais/types';

export const accountNavigation = [
  { label: 'Studio', href: '/studio' },
  { label: 'Generations', href: '/generations' },
  { label: 'Library', href: '/library' },
  { label: 'Settings', href: '/settings/profile' },
  { label: 'Credits', href: '/settings/credits' },
] as const;

export const settingsNavigation = [
  { label: 'Profile', href: '/settings/profile' },
  { label: 'Organization', href: '/settings/organization' },
  { label: 'Members', href: '/settings/members' },
  { label: 'Credits & Usage', href: '/settings/credits' },
  { label: 'Billing', href: '/settings/billing' },
] as const;

export function canManageOrganization(role: OrganizationRole | null): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function canManageMember(
  actorRole: OrganizationRole | null,
  actorUserId: string | undefined,
  target: { userId: string; role: OrganizationRole },
): boolean {
  if (actorRole === 'OWNER') return true;
  return actorRole === 'ADMIN' && target.userId !== actorUserId && target.role !== 'OWNER';
}

export const creditLedgerLabels: Record<CreditLedgerEntryType, string> = {
  INITIAL_GRANT: 'Initial grant',
  SUBSCRIPTION_GRANT: 'Subscription grant',
  CREDIT_PURCHASE: 'Credit purchase',
  GENERATION_DEBIT: 'Generation used',
  GENERATION_REFUND: 'Generation refund',
  ADMIN_ADJUSTMENT: 'Account adjustment',
  EXPIRATION: 'Expired credits',
};

export async function signOutAccount(logout: () => Promise<void>, redirect: () => void): Promise<void> {
  await logout();
  redirect();
}
