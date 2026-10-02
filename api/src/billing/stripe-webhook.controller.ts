import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from './billing.service';

type RawRequest = Request & { rawBody?: Buffer };

@Controller('billing/stripe')
export class StripeWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() request: RawRequest,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true; duplicate?: true }> {
    return this.billing.handleWebhook(request.rawBody, signature);
  }
}
