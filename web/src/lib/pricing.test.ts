import assert from 'node:assert/strict';
import test from 'node:test';
import { CREDIT_PACKAGES, findPricingChoice, PRICING_PLANS, startCheckout } from './pricing';

test('pricing choices are centralized and checkout preserves plan selection', () => {
  assert.deepEqual(PRICING_PLANS.map((plan) => plan.id), ['starter', 'creator', 'studio']);
  assert.equal(CREDIT_PACKAGES.length, 4);
  assert.equal(startCheckout('creator'), '/checkout?selection=creator');
  assert.equal(findPricingChoice('topup-500')?.credits, 500);
});

test('invalid checkout choices cannot fabricate a payment selection', () => {
  assert.throws(() => startCheckout('not-a-plan'), /valid plan/);
});
