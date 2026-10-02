import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

export function createStripeClient(config: ConfigService): Stripe | null {
  const key = config.get<string>('billing.secretKey')?.trim();
  return key ? new Stripe(key) : null;
}
