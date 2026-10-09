import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, OrganizationSubscriptionStatus } from '@prisma/client';
import type {
  AuthUser,
  BillingCheckoutSessionView,
  BillingSelectionId,
  BillingSummaryView,
  CreateBillingCheckoutSessionResponse,
} from '@fashion-ais/types';
import Stripe from 'stripe';
import { CreditsService } from '../credits/credits.service';
import { PrismaService } from '../database/prisma.service';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import { BILLING_CATALOG, isBillingSelectionId } from './billing.catalog';
import { STRIPE_CLIENT } from './stripe.provider';

type Transaction = Prisma.TransactionClient;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
    private readonly credits: CreditsService,
    private readonly config: ConfigService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
  ) {}

  async createCheckoutSession(
    user: AuthUser,
    organizationId: string,
    selectionId: BillingSelectionId,
    operationId: string,
  ): Promise<CreateBillingCheckoutSessionResponse> {
    const membership = await this.access.requireMembership(user.id, organizationId);
    if (membership.role === 'MEMBER') {
      throw new ForbiddenException({ code: 'BILLING_ACCESS_DENIED', message: 'Billing purchases require an owner or admin role' });
    }
    const item = BILLING_CATALOG[selectionId];
    if (!item) throw this.invalidSelection();
    const stripe = this.requireStripe();
    const priceId = this.priceId(selectionId);

    try {
      const local = await this.prisma.billingCheckoutSession.upsert({
        where: {
          organizationId_createdByUserId_operationId: {
            organizationId,
            createdByUserId: user.id,
            operationId,
          },
        },
        create: {
          organizationId,
          createdByUserId: user.id,
          operationId,
          selectionId,
          mode: item.mode === 'subscription' ? 'SUBSCRIPTION' : 'PAYMENT',
        },
        update: {},
      });
      if (local.selectionId !== selectionId) {
        throw new BadRequestException({
          code: 'BILLING_IDEMPOTENCY_CONFLICT',
          message: 'Checkout operation was already used for another selection',
        });
      }
      if (local.stripeCheckoutSessionId) {
        const existing = await stripe.checkout.sessions.retrieve(local.stripeCheckoutSessionId);
        if (!existing.url) throw new Error('Stripe Checkout did not return a URL');
        return { url: existing.url, sessionId: existing.id };
      }

      const customerId = await this.getOrCreateCustomer(stripe, organizationId, user.email);
      await this.prisma.billingCheckoutSession.update({
        where: { id: local.id },
        data: { stripeCustomerId: customerId },
      });
      const metadata = { organizationId, billingCheckoutSessionId: local.id, selectionId };
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: item.mode,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${this.config.getOrThrow<string>('billing.successUrl')}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: this.config.getOrThrow<string>('billing.cancelUrl'),
        client_reference_id: local.id,
        metadata,
        ...(item.mode === 'subscription' ? { subscription_data: { metadata } } : {}),
      }, { idempotencyKey: `billing-checkout:${local.id}` });
      if (!session.url) throw new Error('Stripe Checkout did not return a URL');
      await this.prisma.billingCheckoutSession.update({
        where: { id: local.id },
        data: { stripeCheckoutSessionId: session.id },
      });
      return { url: session.url, sessionId: session.id };
    } catch (error) {
      if (error instanceof ServiceUnavailableException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException({ code: 'BILLING_CHECKOUT_FAILED', message: 'Unable to start checkout' });
    }
  }

  async getCheckoutSession(userId: string, organizationId: string, sessionId: string): Promise<BillingCheckoutSessionView> {
    await this.access.requireMembership(userId, organizationId);
    const session = await this.prisma.billingCheckoutSession.findFirst({
      where: { organizationId, stripeCheckoutSessionId: sessionId },
      include: { organization: { select: { subscription: { select: { status: true } } } } },
    });
    if (!session) throw new NotFoundException({ code: 'BILLING_SESSION_NOT_FOUND', message: 'Billing session not found' });
    return {
      sessionId,
      selectionId: session.selectionId as BillingSelectionId,
      status: session.status,
      amountTotal: session.amountTotal,
      currency: session.currency,
      subscriptionStatus: session.organization.subscription?.status ?? null,
    };
  }

  async getSummary(userId: string, organizationId: string): Promise<BillingSummaryView> {
    await this.access.requireMembership(userId, organizationId);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { creditBalance: true, subscription: true },
    });
    return {
      billingConfigured: this.billingConfigured(),
      creditBalance: organization.creditBalance?.balance ?? 0,
      subscriptionPlan: (organization.subscription?.planId as BillingSelectionId | undefined) ?? null,
      subscriptionStatus: organization.subscription?.status ?? null,
      currentPeriodEnd: organization.subscription?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: organization.subscription?.cancelAtPeriodEnd ?? false,
    };
  }

  private billingConfigured(): boolean {
    const prices = this.config.get<Record<string, string>>('billing.prices');
    return Boolean(this.config.get<boolean>('billing.enabled') && this.stripe && prices && Object.values(prices).every(Boolean));
  }

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<{ received: true; duplicate?: true }> {
    const stripe = this.requireStripe();
    const secret = this.config.get<string>('billing.webhookSecret')?.trim();
    if (!rawBody || !signature || !secret) {
      throw new BadRequestException({ code: 'BILLING_WEBHOOK_INVALID', message: 'Invalid billing webhook' });
    }
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException({ code: 'BILLING_WEBHOOK_INVALID', message: 'Invalid billing webhook' });
    }

    const existing = await this.prisma.stripeWebhookEvent.findUnique({ where: { stripeEventId: event.id } });
    if (existing?.processedAt) return { received: true, duplicate: true };

    try {
      await this.prisma.$transaction(async (transaction) => {
        const record = await transaction.stripeWebhookEvent.upsert({
          where: { stripeEventId: event.id },
          create: { stripeEventId: event.id, type: event.type },
          update: {},
        });
        if (record.processedAt) return;
        await this.processEvent(transaction, event);
        await transaction.stripeWebhookEvent.update({
          where: { stripeEventId: event.id },
          data: { processedAt: new Date(), processingError: null },
        });
      });
      return { received: true };
    } catch {
      await this.prisma.stripeWebhookEvent.upsert({
        where: { stripeEventId: event.id },
        create: { stripeEventId: event.id, type: event.type, processingError: 'Processing failed' },
        update: { processingError: 'Processing failed' },
      }).catch(() => undefined);
      throw new InternalServerErrorException({ code: 'BILLING_WEBHOOK_FAILED', message: 'Billing webhook processing failed' });
    }
  }

  private async processEvent(transaction: Transaction, event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await this.completeCheckout(transaction, event.data.object);
        return;
      case 'checkout.session.async_payment_failed':
        await this.updateCheckoutStatus(transaction, event.data.object.id, 'FAILED');
        return;
      case 'checkout.session.expired':
        await this.updateCheckoutStatus(transaction, event.data.object.id, 'EXPIRED');
        return;
      case 'invoice.paid':
        await this.grantSubscriptionInvoice(transaction, event.data.object);
        return;
      case 'invoice.payment_failed':
        await this.markInvoicePastDue(transaction, event.data.object);
        return;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.syncSubscription(transaction, event.data.object);
        return;
      default:
        return;
    }
  }

  private async completeCheckout(transaction: Transaction, session: Stripe.Checkout.Session): Promise<void> {
    const local = await transaction.billingCheckoutSession.findUnique({ where: { stripeCheckoutSessionId: session.id } });
    if (!local || session.metadata?.billingCheckoutSessionId !== local.id || session.metadata.organizationId !== local.organizationId || session.metadata.selectionId !== local.selectionId) {
      throw new Error('Checkout reconciliation failed');
    }
    if (!isBillingSelectionId(local.selectionId)) throw new Error('Unknown billing selection');
    const item = BILLING_CATALOG[local.selectionId];
    const expectedMode = item.mode === 'subscription' ? 'SUBSCRIPTION' : 'PAYMENT';
    if (local.mode !== expectedMode || session.mode !== item.mode) throw new Error('Checkout mode mismatch');
    const customerId = this.objectId(session.customer);
    if (customerId !== local.stripeCustomerId) throw new Error('Checkout customer mismatch');
    const subscriptionId = this.objectId(session.subscription);
    const paymentIntentId = this.objectId(session.payment_intent);

    await transaction.billingCheckoutSession.update({
      where: { id: local.id },
      data: {
        status: session.payment_status !== 'unpaid' ? 'COMPLETED' : 'CREATED',
        stripeSubscriptionId: subscriptionId,
        stripePaymentIntentId: paymentIntentId,
        amountTotal: session.amount_total,
        currency: session.currency,
        completedAt: session.payment_status !== 'unpaid' ? new Date() : null,
      },
    });
    if (item.kind === 'TOPUP' && session.mode === 'payment' && session.payment_status === 'paid') {
      await this.credits.grant(transaction, {
        organizationId: local.organizationId,
        amount: item.creditAmount,
        type: 'CREDIT_PURCHASE',
        idempotencyKey: `stripe-checkout:${session.id}`,
        referenceType: 'stripe_checkout_session',
        referenceId: session.id,
        description: `${item.creditAmount} credit top-up`,
      });
    } else if (item.kind === 'SUBSCRIPTION' && session.mode === 'subscription' && subscriptionId) {
      await transaction.organizationSubscription.upsert({
        where: { organizationId: local.organizationId },
        create: { organizationId: local.organizationId, stripeSubscriptionId: subscriptionId, stripeCustomerId: customerId, planId: local.selectionId, status: 'INACTIVE' },
        update: { stripeSubscriptionId: subscriptionId, stripeCustomerId: customerId, planId: local.selectionId },
      });
    }
  }

  private async grantSubscriptionInvoice(transaction: Transaction, invoice: Stripe.Invoice): Promise<void> {
    if (invoice.status !== 'paid') return;
    const subscriptionId = this.invoiceSubscriptionId(invoice);
    if (!subscriptionId) return;
    let subscription = await transaction.organizationSubscription.findUnique({ where: { stripeSubscriptionId: subscriptionId } });
    if (!subscription) {
      const customerId = this.objectId(invoice.customer);
      const customer = customerId ? await transaction.billingCustomer.findUnique({ where: { stripeCustomerId: customerId } }) : null;
      const selectionId = this.selectionForInvoice(invoice);
      if (!customer || !selectionId) throw new Error('Invoice reconciliation failed');
      subscription = await transaction.organizationSubscription.upsert({
        where: { organizationId: customer.organizationId },
        create: { organizationId: customer.organizationId, stripeSubscriptionId: subscriptionId, stripeCustomerId: customerId, planId: selectionId, status: 'ACTIVE' },
        update: { stripeSubscriptionId: subscriptionId, stripeCustomerId: customerId, planId: selectionId, status: 'ACTIVE' },
      });
    }
    if (!isBillingSelectionId(subscription.planId) || BILLING_CATALOG[subscription.planId].kind !== 'SUBSCRIPTION') throw new Error('Invalid subscription plan');
    const item = BILLING_CATALOG[subscription.planId];
    await this.credits.grant(transaction, {
      organizationId: subscription.organizationId,
      amount: item.creditAmount,
      type: 'SUBSCRIPTION_GRANT',
      idempotencyKey: `stripe-invoice:${invoice.id}`,
      referenceType: 'stripe_invoice',
      referenceId: invoice.id,
      description: `${item.selectionId} subscription credit grant`,
    });
    await transaction.organizationSubscription.update({ where: { id: subscription.id }, data: { status: 'ACTIVE' } });
  }

  private async syncSubscription(transaction: Transaction, stripeSubscription: Stripe.Subscription): Promise<void> {
    const existing = await transaction.organizationSubscription.findUnique({ where: { stripeSubscriptionId: stripeSubscription.id } });
    const customerId = this.objectId(stripeSubscription.customer);
    const customer = customerId ? await transaction.billingCustomer.findUnique({ where: { stripeCustomerId: customerId } }) : null;
    const metadataSelection = stripeSubscription.metadata.selectionId;
    const priceSelection = this.selectionForPrice(stripeSubscription.items.data[0]?.price.id);
    const selectionId = priceSelection ?? (isBillingSelectionId(metadataSelection) ? metadataSelection : existing?.planId);
    const organizationId = existing?.organizationId ?? customer?.organizationId;
    if (!organizationId || !selectionId || !isBillingSelectionId(selectionId)) throw new Error('Subscription reconciliation failed');
    const firstItem = stripeSubscription.items.data[0];
    await transaction.organizationSubscription.upsert({
      where: { organizationId },
      create: {
        organizationId, stripeSubscriptionId: stripeSubscription.id, stripeCustomerId: customerId, planId: selectionId,
        status: this.subscriptionStatus(stripeSubscription.status),
        currentPeriodStart: firstItem ? new Date(firstItem.current_period_start * 1000) : null,
        currentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : null,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      },
      update: {
        stripeSubscriptionId: stripeSubscription.id, stripeCustomerId: customerId, planId: selectionId,
        status: this.subscriptionStatus(stripeSubscription.status),
        currentPeriodStart: firstItem ? new Date(firstItem.current_period_start * 1000) : null,
        currentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : null,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      },
    });
  }

  private async markInvoicePastDue(transaction: Transaction, invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = this.invoiceSubscriptionId(invoice);
    if (subscriptionId) await transaction.organizationSubscription.updateMany({ where: { stripeSubscriptionId: subscriptionId }, data: { status: 'PAST_DUE' } });
  }

  private async updateCheckoutStatus(transaction: Transaction, sessionId: string, status: 'FAILED' | 'EXPIRED'): Promise<void> {
    await transaction.billingCheckoutSession.updateMany({ where: { stripeCheckoutSessionId: sessionId }, data: { status } });
  }

  private async getOrCreateCustomer(stripe: Stripe, organizationId: string, email: string): Promise<string> {
    const existing = await this.prisma.billingCustomer.findUnique({ where: { organizationId } });
    if (existing) return existing.stripeCustomerId;
    const customer = await stripe.customers.create(
      { email, metadata: { organizationId } },
      { idempotencyKey: `billing-customer:${organizationId}` },
    );
    const record = await this.prisma.billingCustomer.upsert({
      where: { organizationId },
      create: { organizationId, stripeCustomerId: customer.id },
      update: {},
    });
    return record.stripeCustomerId;
  }

  private requireStripe(): Stripe {
    if (!this.config.get<boolean>('billing.enabled') || !this.stripe) throw new ServiceUnavailableException({ code: 'BILLING_NOT_CONFIGURED', message: 'Billing is not configured' });
    return this.stripe;
  }

  private priceId(selectionId: BillingSelectionId): string {
    const price = this.config.get<Record<string, string>>('billing.prices')?.[selectionId];
    if (!price) throw new ServiceUnavailableException({ code: 'BILLING_NOT_CONFIGURED', message: 'Billing is not configured' });
    return price;
  }

  private selectionForInvoice(invoice: Stripe.Invoice): BillingSelectionId | null {
    const price = invoice.lines.data[0]?.pricing?.price_details?.price;
    const priceId = typeof price === 'string' ? price : price?.id;
    return this.selectionForPrice(priceId);
  }

  private selectionForPrice(priceId: string | undefined): BillingSelectionId | null {
    if (!priceId) return null;
    return (Object.keys(BILLING_CATALOG) as BillingSelectionId[]).find((id) => BILLING_CATALOG[id].kind === 'SUBSCRIPTION' && this.config.get<Record<string, string>>('billing.prices')?.[id] === priceId) ?? null;
  }

  private invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
    return this.objectId(invoice.parent?.subscription_details?.subscription);
  }

  private objectId(value: string | { id: string } | null | undefined): string | null {
    return typeof value === 'string' ? value : value?.id ?? null;
  }

  private subscriptionStatus(status: Stripe.Subscription.Status): OrganizationSubscriptionStatus {
    if (status === 'active' || status === 'trialing') return 'ACTIVE';
    if (status === 'past_due') return 'PAST_DUE';
    if (status === 'unpaid' || status === 'incomplete' || status === 'incomplete_expired') return 'UNPAID';
    if (status === 'canceled') return 'CANCELLED';
    return 'INACTIVE';
  }

  private invalidSelection(): BadRequestException {
    return new BadRequestException({ code: 'BILLING_SELECTION_INVALID', message: 'Choose a valid billing option' });
  }
}
