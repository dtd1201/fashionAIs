import { registerAs } from '@nestjs/config';

export default registerAs('billing', () => ({
  secretKey: process.env.STRIPE_SECRET_KEY?.trim() ?? '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? '',
  successUrl: process.env.STRIPE_SUCCESS_URL ?? 'http://localhost:3000/billing/success',
  cancelUrl: process.env.STRIPE_CANCEL_URL ?? 'http://localhost:3000/pricing',
  prices: {
    starter: process.env.STRIPE_PRICE_STARTER?.trim() ?? '',
    creator: process.env.STRIPE_PRICE_CREATOR?.trim() ?? '',
    studio: process.env.STRIPE_PRICE_STUDIO?.trim() ?? '',
    'topup-100': process.env.STRIPE_PRICE_TOPUP_100?.trim() ?? '',
    'topup-500': process.env.STRIPE_PRICE_TOPUP_500?.trim() ?? '',
    'topup-1000': process.env.STRIPE_PRICE_TOPUP_1000?.trim() ?? '',
    'topup-5000': process.env.STRIPE_PRICE_TOPUP_5000?.trim() ?? '',
  },
}));
