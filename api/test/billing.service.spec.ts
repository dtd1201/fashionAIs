/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { BillingService } from '../src/billing/billing.service';

const organizationId = '11111111-1111-4111-8111-111111111111';
const user = { id: '22222222-2222-4222-8222-222222222222', email: 'owner@example.com' };

function checkoutHarness(role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'OWNER') {
  const local = { id: '33333333-3333-4333-8333-333333333333' };
  const stripe = {
    customers: { create: jest.fn().mockResolvedValue({ id: 'cus_1' }) },
    checkout: { sessions: { create: jest.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/pay/cs_1' }) } },
    webhooks: { constructEvent: jest.fn() },
  };
  const prisma = {
    billingCustomer: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ organizationId, stripeCustomerId: 'cus_1' }),
    },
    billingCheckoutSession: {
      create: jest.fn().mockResolvedValue(local),
      update: jest.fn().mockResolvedValue(local),
    },
  };
  const access = { requireMembership: jest.fn().mockResolvedValue({ role }) };
  const config = {
    get: jest.fn((key: string) => key === 'billing.prices' ? { starter: 'price_starter', creator: 'price_creator', 'topup-500': 'price_topup_500' } : 'whsec_test'),
    getOrThrow: jest.fn((key: string) => key === 'billing.successUrl' ? 'http://localhost:3000/billing/success' : 'http://localhost:3000/pricing'),
  };
  const service = new BillingService(prisma as never, access as never, { grant: jest.fn() } as never, config as never, stripe as never);
  return { service, stripe, prisma, access };
}

describe('BillingService checkout', () => {
  it.each(['OWNER', 'ADMIN'] as const)('%s creates a subscription checkout from the backend catalog', async (role) => {
    const state = checkoutHarness(role);
    await expect(state.service.createCheckoutSession(user as never, organizationId, 'creator')).resolves.toEqual({ url: 'https://checkout.stripe.com/pay/cs_1', sessionId: 'cs_1' });
    expect(state.stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ mode: 'subscription', line_items: [{ price: 'price_creator', quantity: 1 }] }));
  });

  it('uses payment mode and the configured price for top-ups', async () => {
    const state = checkoutHarness();
    await state.service.createCheckoutSession(user as never, organizationId, 'topup-500');
    expect(state.stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ mode: 'payment', line_items: [{ price: 'price_topup_500', quantity: 1 }] }));
  });

  it('rejects members and invalid selections with stable codes', async () => {
    await expect(checkoutHarness('MEMBER').service.createCheckoutSession(user as never, organizationId, 'creator')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'BILLING_ACCESS_DENIED' }) });
    await expect(checkoutHarness().service.createCheckoutSession(user as never, organizationId, 'invalid' as never)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'BILLING_SELECTION_INVALID' }) });
  });

  it('reuses the organization Stripe customer', async () => {
    const state = checkoutHarness();
    state.prisma.billingCustomer.findUnique.mockResolvedValue({ organizationId, stripeCustomerId: 'cus_existing' });
    await state.service.createCheckoutSession(user as never, organizationId, 'starter');
    expect(state.stripe.customers.create).not.toHaveBeenCalled();
    expect(state.stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_existing' }));
  });
});

describe('BillingService summary', () => {
  it('reports a disabled billing state without Stripe while preserving subscription data', async () => {
    const prisma = { organization: { findUniqueOrThrow: jest.fn().mockResolvedValue({ creditBalance: { balance: 7 }, subscription: null }) } };
    const access = { requireMembership: jest.fn().mockResolvedValue({ role: 'OWNER' }) };
    const config = { get: jest.fn((key: string) => key === 'billing.prices' ? {} : undefined) };
    const service = new BillingService(prisma as never, access as never, {} as never, config as never, null);
    await expect(service.getSummary(user.id, organizationId)).resolves.toEqual({
      billingConfigured: false,
      creditBalance: 7,
      subscriptionPlan: null,
      subscriptionStatus: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  });
});

function webhookHarness(event: Record<string, unknown>) {
  const events = new Map<string, { stripeEventId: string; type: string; processedAt: Date | null; processingError: string | null }>();
  const checkout = {
    id: '33333333-3333-4333-8333-333333333333', organizationId, selectionId: 'topup-500', mode: 'PAYMENT',
    stripeCustomerId: 'cus_1', status: 'CREATED',
  };
  const grant = jest.fn().mockResolvedValue(true);
  const tx = {
    stripeWebhookEvent: {
      upsert: jest.fn(({ where, create }: any) => {
        const current = events.get(where.stripeEventId) ?? { ...create, processedAt: null, processingError: null };
        events.set(where.stripeEventId, current);
        return current;
      }),
      update: jest.fn(({ where, data }: any) => {
        const updated = { ...events.get(where.stripeEventId)!, ...data };
        events.set(where.stripeEventId, updated);
        return updated;
      }),
    },
    billingCheckoutSession: {
      findUnique: jest.fn().mockResolvedValue(checkout),
      update: jest.fn().mockResolvedValue(checkout),
      updateMany: jest.fn(),
    },
    organizationSubscription: {
      findUnique: jest.fn().mockResolvedValue({ id: 'sub-local', organizationId, stripeSubscriptionId: 'sub_1', planId: 'creator' }),
      update: jest.fn(), updateMany: jest.fn(), upsert: jest.fn(),
    },
    billingCustomer: { findUnique: jest.fn() },
  };
  const prisma = {
    stripeWebhookEvent: {
      findUnique: jest.fn(({ where }: any) => events.get(where.stripeEventId) ?? null),
      upsert: tx.stripeWebhookEvent.upsert,
    },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const stripe = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } };
  const config = { get: jest.fn((key: string) => key === 'billing.webhookSecret' ? 'whsec_test' : { creator: 'price_creator' }) };
  const service = new BillingService(prisma as never, {} as never, { grant } as never, config as never, stripe as never);
  return { service, stripe, grant, tx, events };
}

describe('BillingService webhooks', () => {
  const topupEvent = {
    id: 'evt_topup', type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', mode: 'payment', payment_status: 'paid', customer: 'cus_1', subscription: null, payment_intent: 'pi_1', amount_total: 1500, currency: 'usd', metadata: { organizationId, billingCheckoutSessionId: '33333333-3333-4333-8333-333333333333', selectionId: 'topup-500' } } },
  };

  it('verifies the raw body signature and grants the catalog top-up once', async () => {
    const state = webhookHarness(topupEvent);
    await expect(state.service.handleWebhook(Buffer.from('{}'), 'signature')).resolves.toEqual({ received: true });
    expect(state.stripe.webhooks.constructEvent).toHaveBeenCalledWith(Buffer.from('{}'), 'signature', 'whsec_test');
    expect(state.grant).toHaveBeenCalledWith(state.tx, expect.objectContaining({ amount: 500, type: 'CREDIT_PURCHASE', idempotencyKey: 'stripe-checkout:cs_1' }));
    await expect(state.service.handleWebhook(Buffer.from('{}'), 'signature')).resolves.toEqual({ received: true, duplicate: true });
    expect(state.grant).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid signatures without processing', async () => {
    const state = webhookHarness(topupEvent);
    state.stripe.webhooks.constructEvent.mockImplementation(() => { throw new Error('bad signature'); });
    await expect(state.service.handleWebhook(Buffer.from('{}'), 'bad')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'BILLING_WEBHOOK_INVALID' }) });
    expect(state.grant).not.toHaveBeenCalled();
  });

  it('grants subscription credits from a paid invoice and never from subscription updates', async () => {
    const invoice = webhookHarness({ id: 'evt_invoice', type: 'invoice.paid', data: { object: { id: 'in_1', status: 'paid', customer: 'cus_1', parent: { subscription_details: { subscription: 'sub_1' } }, lines: { data: [] } } } });
    await invoice.service.handleWebhook(Buffer.from('{}'), 'signature');
    expect(invoice.grant).toHaveBeenCalledWith(invoice.tx, expect.objectContaining({ amount: 1500, type: 'SUBSCRIPTION_GRANT', idempotencyKey: 'stripe-invoice:in_1' }));

    const updated = webhookHarness({ id: 'evt_sub', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active', customer: 'cus_1', metadata: { selectionId: 'creator' }, cancel_at_period_end: false, items: { data: [{ price: { id: 'price_creator' }, current_period_start: 1, current_period_end: 2 }] } } } });
    await updated.service.handleWebhook(Buffer.from('{}'), 'signature');
    expect(updated.grant).not.toHaveBeenCalled();
  });

  it('marks failed subscription invoices past due without granting credits', async () => {
    const state = webhookHarness({ id: 'evt_failed', type: 'invoice.payment_failed', data: { object: { id: 'in_failed', parent: { subscription_details: { subscription: 'sub_1' } } } } });
    await state.service.handleWebhook(Buffer.from('{}'), 'signature');
    expect(state.tx.organizationSubscription.updateMany).toHaveBeenCalledWith({ where: { stripeSubscriptionId: 'sub_1' }, data: { status: 'PAST_DUE' } });
    expect(state.grant).not.toHaveBeenCalled();
  });
});
