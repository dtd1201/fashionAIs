import type { BillingSelectionId } from '@fashion-ais/types';

export interface BillingCatalogItem {
  selectionId: BillingSelectionId;
  kind: 'SUBSCRIPTION' | 'TOPUP';
  mode: 'subscription' | 'payment';
  creditAmount: number;
  priceConfigKey: string;
}

export const BILLING_CATALOG: Record<BillingSelectionId, BillingCatalogItem> = {
  starter: { selectionId: 'starter', kind: 'SUBSCRIPTION', mode: 'subscription', creditAmount: 500, priceConfigKey: 'starter' },
  creator: { selectionId: 'creator', kind: 'SUBSCRIPTION', mode: 'subscription', creditAmount: 1500, priceConfigKey: 'creator' },
  studio: { selectionId: 'studio', kind: 'SUBSCRIPTION', mode: 'subscription', creditAmount: 5000, priceConfigKey: 'studio' },
  'topup-100': { selectionId: 'topup-100', kind: 'TOPUP', mode: 'payment', creditAmount: 100, priceConfigKey: 'topup-100' },
  'topup-500': { selectionId: 'topup-500', kind: 'TOPUP', mode: 'payment', creditAmount: 500, priceConfigKey: 'topup-500' },
  'topup-1000': { selectionId: 'topup-1000', kind: 'TOPUP', mode: 'payment', creditAmount: 1000, priceConfigKey: 'topup-1000' },
  'topup-5000': { selectionId: 'topup-5000', kind: 'TOPUP', mode: 'payment', creditAmount: 5000, priceConfigKey: 'topup-5000' },
};

export function isBillingSelectionId(value: string): value is BillingSelectionId {
  return Object.hasOwn(BILLING_CATALOG, value);
}
