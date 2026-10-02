import assert from 'node:assert/strict';
import test from 'node:test';
import { safeReturnTo } from './return-to';

test('preserves local checkout return paths and rejects external redirects', () => {
  assert.equal(safeReturnTo('/checkout?selection=creator'), '/checkout?selection=creator');
  assert.equal(safeReturnTo('https://evil.example'), '/dashboard');
  assert.equal(safeReturnTo('//evil.example'), '/dashboard');
});
