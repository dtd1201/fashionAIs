export type PricingChoiceType = 'plan' | 'credits';

export interface PricingChoice {
  id: string;
  type: PricingChoiceType;
  name: string;
  price: number;
  credits: number;
  interval?: 'month';
  description: string;
}

export const PRICING_PLANS: PricingChoice[] = [
  { id: 'starter', type: 'plan', name: 'Starter', price: 9, credits: 500, interval: 'month', description: 'For exploring AI-assisted fashion workflows.' },
  { id: 'creator', type: 'plan', name: 'Creator', price: 19, credits: 1500, interval: 'month', description: 'For creators producing visual content regularly.' },
  { id: 'studio', type: 'plan', name: 'Studio', price: 49, credits: 5000, interval: 'month', description: 'For teams developing campaigns at greater volume.' },
];

export const CREDIT_PACKAGES: PricingChoice[] = [
  { id: 'topup-100', type: 'credits', name: 'Mini top-up', price: 4, credits: 100, description: 'A small one-time credit top-up.' },
  { id: 'topup-500', type: 'credits', name: 'Creator top-up', price: 15, credits: 500, description: 'Extra room for active projects.' },
  { id: 'topup-1000', type: 'credits', name: 'Campaign top-up', price: 25, credits: 1000, description: 'A flexible campaign-sized package.' },
  { id: 'topup-5000', type: 'credits', name: 'Studio top-up', price: 99, credits: 5000, description: 'A larger one-time studio package.' },
];

export function findPricingChoice(id: string | null): PricingChoice | null {
  return [...PRICING_PLANS, ...CREDIT_PACKAGES].find((choice) => choice.id === id) ?? null;
}

export function checkoutHref(choice: PricingChoice): string {
  return `/checkout?selection=${encodeURIComponent(choice.id)}`;
}

export function startCheckout(choiceId: string): string {
  const choice = findPricingChoice(choiceId);
  if (!choice) throw new Error('Choose a valid plan or credit package');
  return checkoutHref(choice);
}

export function openCreditPurchase(packageId: string): string {
  return startCheckout(packageId);
}
