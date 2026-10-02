import assert from 'node:assert/strict';
import test from 'node:test';
import { accountNavigation, canManageMember, canManageOrganization, creditLedgerLabels, settingsNavigation, signOutAccount } from './settings';

test('profile and settings navigation expose the authenticated account destinations', () => {
  assert.deepEqual(settingsNavigation.map((item) => item.href), ['/settings/profile', '/settings/organization', '/settings/members', '/settings/credits', '/settings/billing']);
  assert.deepEqual(accountNavigation.map((item) => item.label), ['Studio', 'Generations', 'Library', 'Settings', 'Credits']);
});

test('organization rename and billing actions are limited to owners and admins', () => {
  assert.equal(canManageOrganization('OWNER'), true);
  assert.equal(canManageOrganization('ADMIN'), true);
  assert.equal(canManageOrganization('MEMBER'), false);
});

test('member controls mirror backend role boundaries', () => {
  assert.equal(canManageMember('OWNER', 'owner', { userId: 'owner', role: 'OWNER' }), true);
  assert.equal(canManageMember('ADMIN', 'admin', { userId: 'member', role: 'MEMBER' }), true);
  assert.equal(canManageMember('ADMIN', 'admin', { userId: 'owner', role: 'OWNER' }), false);
  assert.equal(canManageMember('ADMIN', 'admin', { userId: 'admin', role: 'ADMIN' }), false);
  assert.equal(canManageMember('MEMBER', 'member', { userId: 'other', role: 'MEMBER' }), false);
});

test('all credit ledger types have friendly labels', () => {
  assert.deepEqual(Object.keys(creditLedgerLabels).sort(), ['ADMIN_ADJUSTMENT', 'CREDIT_PURCHASE', 'EXPIRATION', 'GENERATION_DEBIT', 'GENERATION_REFUND', 'INITIAL_GRANT', 'SUBSCRIPTION_GRANT']);
});

test('sign out clears the session before redirecting', async () => {
  const events: string[] = [];
  await signOutAccount(async () => { events.push('logout'); }, () => { events.push('redirect'); });
  assert.deepEqual(events, ['logout', 'redirect']);
});
