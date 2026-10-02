/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { CreditsService } from '../src/credits/credits.service';
import { GenerationCostService } from '../src/credits/generation-cost.service';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

function harness(initialBalance = 0, role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'OWNER') {
  let balance = initialBalance;
  const entries: Array<Record<string, unknown>> = [];
  const generations = new Map<string, Record<string, unknown>>();
  const transaction = {
    organizationCreditBalance: {
      upsert: jest.fn(({ create, update }: { create: { balance: number }; update: { balance?: { increment?: number } } }) => {
        if (update.balance?.increment) balance += update.balance.increment;
        return { organizationId, balance: balance || create.balance };
      }),
      updateMany: jest.fn(({ where, data }: { where: { balance?: { gte: number } }; data: { balance: { decrement?: number; increment?: number } } }) => {
        if (where.balance?.gte !== undefined && balance < where.balance.gte) return { count: 0 };
        balance -= data.balance.decrement ?? 0;
        balance += data.balance.increment ?? 0;
        return { count: 1 };
      }),
      findUnique: jest.fn(() => ({ organizationId, balance })),
      findUniqueOrThrow: jest.fn(() => ({ organizationId, balance })),
    },
    creditLedgerEntry: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => { entries.push({ id: `entry-${entries.length}`, createdAt: new Date(), ...data }); return entries.at(-1); }),
      findUnique: jest.fn(({ where }: { where: { idempotencyKey: string } }) => entries.find((entry) => entry.idempotencyKey === where.idempotencyKey) ?? null),
      findMany: jest.fn(() => entries),
      groupBy: jest.fn(() => {
        const totals = new Map<string, number>();
        for (const entry of entries) {
          const type = String(entry.type);
          totals.set(type, (totals.get(type) ?? 0) + Number(entry.amount));
        }
        return [...totals].map(([type, amount]) => ({ type, _sum: { amount } }));
      }),
    },
    generation: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) => generations.get(where.id) ?? null),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(generations.get(where.id) ?? {}, data)),
    },
    generationOutputAsset: { count: jest.fn(() => 0) },
  };
  const prisma = {
    ...transaction,
    $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
  };
  const access = { requireMembership: jest.fn().mockResolvedValue({ role }) };
  return { service: new CreditsService(prisma as never, access as never), transaction, entries, generations, getBalance: () => balance };
}

describe('CreditsService', () => {
  it('creates balance safely, grants/admin-adjusts, and prevents negative balances', async () => {
    const state = harness();
    await expect(state.service.getBalance(userId, organizationId)).resolves.toEqual({ balance: 0, currency: 'credits' });
    await expect(state.service.adjust(organizationId, userId, 5, 'Development grant')).resolves.toEqual({ balance: 5, currency: 'credits' });
    expect(state.entries[0]).toMatchObject({ type: 'ADMIN_ADJUSTMENT', amount: 5, balanceAfter: 5 });
    await expect(state.service.adjust(organizationId, userId, -6, 'Too much')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CREDIT_BALANCE_NEGATIVE' }) });
  });

  it('atomically debits and records balanceAfter', async () => {
    const state = harness(3);
    await state.service.reserveGenerationCredits(state.transaction as never, { organizationId, generationId: 'generation-1', userId, cost: 2 });
    expect(state.getBalance()).toBe(1);
    expect(state.entries[0]).toMatchObject({ type: 'GENERATION_DEBIT', amount: -2, balanceAfter: 1 });
  });

  it('two concurrent debits cannot overspend one credit', async () => {
    const state = harness(1);
    const results = await Promise.allSettled([
      state.service.reserveGenerationCredits(state.transaction as never, { organizationId, generationId: 'generation-1', userId, cost: 1 }),
      state.service.reserveGenerationCredits(state.transaction as never, { organizationId, generationId: 'generation-2', userId, cost: 1 }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(state.getBalance()).toBe(0);
    expect(state.entries.filter((entry) => entry.type === 'GENERATION_DEBIT')).toHaveLength(1);
  });

  it('refunds a failed generation exactly once and never refunds completed work', async () => {
    const state = harness(0);
    state.generations.set('failed', { id: 'failed', organizationId, creditCost: 2, creditsRefundedAt: null, status: 'FAILED' });
    await expect(state.service.refundGeneration(state.transaction as never, 'failed', 'failed')).resolves.toBe(true);
    await expect(state.service.refundGeneration(state.transaction as never, 'failed', 'again')).resolves.toBe(false);
    expect(state.getBalance()).toBe(2);
    expect(state.entries.filter((entry) => entry.type === 'GENERATION_REFUND')).toHaveLength(1);
    state.generations.set('complete', { id: 'complete', organizationId, creditCost: 2, creditsRefundedAt: null, status: 'COMPLETED' });
    await expect(state.service.refundGeneration(state.transaction as never, 'complete', 'complete')).resolves.toBe(false);
  });

  it('allows all members to see balance but restricts ledger to owner/admin', async () => {
    await expect(harness(1, 'MEMBER').service.getBalance(userId, organizationId)).resolves.toEqual({ balance: 1, currency: 'credits' });
    await expect(harness(1, 'MEMBER').service.listLedger(userId, organizationId, 20)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CREDIT_LEDGER_FORBIDDEN' }) });
    await expect(harness(1, 'ADMIN').service.listLedger(userId, organizationId, 20)).resolves.toMatchObject({ items: [] });
  });

  it('aggregates credit usage in the database instead of loading the ledger', async () => {
    const state = harness(42);
    state.entries.push(
      { type: 'INITIAL_GRANT', amount: 10 },
      { type: 'SUBSCRIPTION_GRANT', amount: 50 },
      { type: 'CREDIT_PURCHASE', amount: 20 },
      { type: 'GENERATION_DEBIT', amount: -40 },
      { type: 'GENERATION_REFUND', amount: 2 },
    );
    await expect(state.service.getUsageSummary(userId, organizationId)).resolves.toEqual({
      balance: 42,
      usedCredits: 40,
      refundedCredits: 2,
      grantedCredits: 60,
      purchasedCredits: 20,
    });
    expect(state.transaction.creditLedgerEntry.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId } }));
    expect(state.transaction.creditLedgerEntry.findMany).not.toHaveBeenCalled();
  });

  it('returns stable cursor pagination metadata', async () => {
    const state = harness();
    state.entries.push(
      { id: 'first', type: 'INITIAL_GRANT', amount: 10, balanceAfter: 10, generationId: null, description: null, createdAt: new Date() },
      { id: 'second', type: 'GENERATION_DEBIT', amount: -1, balanceAfter: 9, generationId: null, description: null, createdAt: new Date() },
    );
    await expect(state.service.listLedger(userId, organizationId, 1)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'first' })],
      pageInfo: { hasNextPage: true, nextCursor: 'first' },
    });
  });
});

describe('GenerationCostService', () => {
  const service = new GenerationCostService();
  it.each([1, 2, 3, 4] as const)('charges one credit per virtual try-on output: %s', (num_images) => {
    expect(service.calculate({ type: 'VIRTUAL_TRY_ON', inputs: [], parameters: { num_images } })).toBe(num_images);
  });
});
