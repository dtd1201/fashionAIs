import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser, BillingCheckoutSessionView, BillingSummaryView, CreateBillingCheckoutSessionResponse } from '@fashion-ais/types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BillingService } from './billing.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

@Controller('organizations/:organizationId/billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('checkout-session')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createCheckoutSession(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateCheckoutSessionDto,
  ): Promise<CreateBillingCheckoutSessionResponse> {
    return this.billing.createCheckoutSession(user, organizationId, dto.selectionId, dto.operationId);
  }

  @Get('checkout-session/:sessionId')
  getCheckoutSession(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<BillingCheckoutSessionView> {
    return this.billing.getCheckoutSession(user.id, organizationId, sessionId);
  }

  @Get()
  getSummary(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
  ): Promise<BillingSummaryView> {
    return this.billing.getSummary(user.id, organizationId);
  }
}
