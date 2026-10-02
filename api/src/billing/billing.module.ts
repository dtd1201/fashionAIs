import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { createStripeClient, STRIPE_CLIENT } from './stripe.provider';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [AuthModule, OrganizationsModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, { provide: STRIPE_CLIENT, useFactory: createStripeClient, inject: [ConfigService] }],
})
export class BillingModule {}
