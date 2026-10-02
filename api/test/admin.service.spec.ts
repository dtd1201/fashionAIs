/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { validate } from 'class-validator';
import { AdminService } from '../src/admin/admin.service';
import { AdjustCreditsDto } from '../src/admin/dto/adjust-credits.dto';

function service(prismaOverrides: Record<string, unknown> = {}, configValues: Record<string, unknown> = {}) {
  const prisma = {
    user: { count: jest.fn().mockResolvedValue(2), findMany: jest.fn().mockResolvedValue([]) },
    organization: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([]) },
    generation: { count: jest.fn().mockResolvedValue(3), groupBy: jest.fn().mockResolvedValue([{ status: 'COMPLETED', _count: { _all: 2 } }]), findMany: jest.fn().mockResolvedValue([]) },
    asset: { count: jest.fn().mockResolvedValue(4) },
    organizationCreditBalance: { aggregate: jest.fn().mockResolvedValue({ _sum: { balance: 9 } }) },
    creditLedgerEntry: { groupBy: jest.fn().mockResolvedValue([{ type: 'GENERATION_DEBIT', _sum: { amount: -5 } }]), findMany: jest.fn().mockResolvedValue([]) },
    billingCustomer: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([]) },
    organizationSubscription: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([]) },
    billingCheckoutSession: { findMany: jest.fn().mockResolvedValue([]) },
    stripeWebhookEvent: { groupBy: jest.fn().mockResolvedValue([]) },
    isHealthy: jest.fn().mockResolvedValue(true),
    ...prismaOverrides,
  };
  const queue = { isRedisHealthy: jest.fn().mockResolvedValue(true) };
  const config = { get: jest.fn((key: string) => configValues[key]) };
  return { admin: new AdminService(prisma as never, queue as never, config as never), prisma };
}

describe('AdminService', () => {
  it('returns overview from aggregate database queries', async () => {
    await expect(service().admin.overview()).resolves.toMatchObject({ totalUsers: 2, activeUsers: 2, totalOrganizations: 1, totalGenerations: 3, aggregateCreditBalance: 9, creditsConsumed: 5 });
  });

  it('applies user pagination and filters without selecting secret fields', async () => {
    const state = service({ user: { findMany: jest.fn().mockResolvedValue([]) } });
    await state.admin.users({ limit: 10, search: 'person', status: 'ACTIVE', systemAdmin: false });
    const query = (state.prisma.user as any).findMany.mock.calls[0][0];
    expect(query.take).toBe(11); expect(query.where.status).toBe('ACTIVE'); expect(query.where.isSystemAdmin).toBe(false);
    expect(query.select).not.toHaveProperty('passwordHash'); expect(query.select).not.toHaveProperty('sessions');
  });

  it('applies organization and generation pagination filters', async () => {
    const state = service();
    await state.admin.organizations({ limit: 5, search: 'studio' });
    await state.admin.generations({ limit: 5, status: 'FAILED', provider: 'FASHN' });
    expect((state.prisma.organization as any).findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 6 }));
    expect((state.prisma.generation as any).findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'FAILED', aiJob: { provider: 'FASHN' } }), take: 6 }));
  });

  it('system diagnostics expose safe state only', async () => {
    const result = await service({}, { 'app.nodeEnv': 'test', 'ai.providers': { virtualTryOn: 'fashn' }, 'storage.transport': 'worker', 'storage.configured': true, 'billing.secretKey': 'secret', 'billing.prices': { starter: 'price' } }).admin.system();
    expect(result).toMatchObject({ environment: 'test', storage: { transport: 'worker', configured: true }, billingConfigured: true });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});

describe('AdjustCreditsDto', () => {
  it('rejects zero values and missing reasons', async () => {
    const dto = Object.assign(new AdjustCreditsDto(), { amount: 0, reason: '' });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['amount', 'reason']));
  });
});
