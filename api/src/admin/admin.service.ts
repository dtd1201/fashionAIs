import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CreditLedgerEntryType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QueueService } from '../queue/queue.service';
import type { AdminCreditsQueryDto, AdminGenerationsQueryDto, AdminListDto, AdminUsersQueryDto } from './dto/admin-list.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly queue: QueueService, private readonly config: ConfigService) {}

  async overview() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalUsers, activeUsers, totalOrganizations, totalGenerations, generationsByStatus, totalAssets, balances, credits, billingCustomers, subscriptions, failedRecent] = await Promise.all([
      this.prisma.user.count(), this.prisma.user.count({ where: { status: 'ACTIVE' } }), this.prisma.organization.count(), this.prisma.generation.count(),
      this.prisma.generation.groupBy({ by: ['status'], _count: { _all: true } }), this.prisma.asset.count(),
      this.prisma.organizationCreditBalance.aggregate({ _sum: { balance: true } }), this.prisma.creditLedgerEntry.groupBy({ by: ['type'], _sum: { amount: true } }),
      this.prisma.billingCustomer.count(), this.prisma.organizationSubscription.count(), this.prisma.generation.count({ where: { status: 'FAILED', failedAt: { gte: since } } }),
    ]);
    const credit = this.creditTotals(credits);
    return { totalUsers, activeUsers, totalOrganizations, totalGenerations, generationsByStatus: Object.fromEntries(generationsByStatus.map((row) => [row.status, row._count._all])), totalAssets, aggregateCreditBalance: balances._sum.balance ?? 0, creditsGranted: credit.granted, creditsConsumed: credit.debited, creditsRefunded: credit.refunded, billingCustomers, subscriptions, failedGenerationsLast24Hours: failedRecent };
  }

  async users(query: AdminUsersQueryDto) {
    const search = query.search?.trim();
    const rows = await this.prisma.user.findMany({ where: { ...(query.status ? { status: query.status } : {}), ...(query.systemAdmin !== undefined ? { isSystemAdmin: query.systemAdmin } : {}), ...(search ? { OR: [{ email: { contains: search, mode: 'insensitive' } }, { displayName: { contains: search, mode: 'insensitive' } }] } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), take: query.limit + 1, select: { id: true, email: true, displayName: true, status: true, isSystemAdmin: true, createdAt: true, _count: { select: { memberships: true } } } });
    return this.page(rows, query.limit, (row) => ({ id: row.id, email: row.email, displayName: row.displayName, status: row.status, isSystemAdmin: row.isSystemAdmin, createdAt: row.createdAt.toISOString(), membershipCount: row._count.memberships }));
  }

  async user(id: string) {
    const row = await this.prisma.user.findUnique({ where: { id }, select: { id: true, email: true, displayName: true, status: true, isSystemAdmin: true, createdAt: true, memberships: { orderBy: { createdAt: 'asc' }, select: { id: true, role: true, createdAt: true, organization: { select: { id: true, name: true, slug: true } } } } } });
    if (!row) throw this.notFound('ADMIN_USER_NOT_FOUND', 'User not found');
    return { ...row, createdAt: row.createdAt.toISOString(), memberships: row.memberships.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) };
  }

  async organizations(query: AdminListDto) {
    const search = query.search?.trim();
    const rows = await this.prisma.organization.findMany({ where: search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { slug: { contains: search, mode: 'insensitive' } }] } : undefined, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), take: query.limit + 1, select: { id: true, name: true, slug: true, createdAt: true, creditBalance: { select: { balance: true } }, _count: { select: { memberships: true, generations: true } }, memberships: { where: { role: 'OWNER' }, select: { id: true } } } });
    return this.page(rows, query.limit, (row) => ({ id: row.id, name: row.name, slug: row.slug, createdAt: row.createdAt.toISOString(), memberCount: row._count.memberships, ownerCount: row.memberships.length, creditBalance: row.creditBalance?.balance ?? 0, generationCount: row._count.generations }));
  }

  async organization(id: string) {
    const row = await this.prisma.organization.findUnique({ where: { id }, select: { id: true, name: true, slug: true, createdAt: true, creditBalance: { select: { balance: true } }, subscription: { select: { planId: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true } }, memberships: { orderBy: { createdAt: 'asc' }, select: { id: true, role: true, createdAt: true, user: { select: { id: true, email: true, displayName: true, status: true } } } }, creditEntries: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20, select: { id: true, type: true, amount: true, balanceAfter: true, description: true, createdAt: true, createdByUserId: true } }, generations: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20, select: { id: true, type: true, status: true, creditCost: true, createdAt: true, aiJob: { select: { provider: true } } } } } });
    if (!row) throw this.notFound('ADMIN_ORGANIZATION_NOT_FOUND', 'Organization not found');
    return { ...row, createdAt: row.createdAt.toISOString(), creditBalance: row.creditBalance?.balance ?? 0, subscription: row.subscription ? { ...row.subscription, currentPeriodEnd: row.subscription.currentPeriodEnd?.toISOString() ?? null } : null, memberships: row.memberships.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })), creditEntries: row.creditEntries.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })), generations: row.generations.map((item) => ({ ...item, provider: item.aiJob?.provider ?? null, aiJob: undefined, createdAt: item.createdAt.toISOString() })) };
  }

  async generations(query: AdminGenerationsQueryDto) {
    const rows = await this.prisma.generation.findMany({ where: { ...(query.status ? { status: query.status } : {}), ...(query.organizationId ? { organizationId: query.organizationId } : {}), ...(query.provider ? { aiJob: { provider: query.provider } } : {}), ...((query.from || query.to) ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), take: query.limit + 1, select: { id: true, type: true, status: true, creditCost: true, createdAt: true, completedAt: true, startedAt: true, organization: { select: { id: true, name: true } }, createdByUser: { select: { id: true, email: true } }, aiJob: { select: { provider: true, attempt: true, maxAttempts: true } } } });
    return this.page(rows, query.limit, (row) => ({ ...row, provider: row.aiJob?.provider ?? null, attempt: row.aiJob?.attempt ?? 0, maxAttempts: row.aiJob?.maxAttempts ?? 0, aiJob: undefined, createdAt: row.createdAt.toISOString(), startedAt: row.startedAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null }));
  }

  async generation(id: string) {
    const row = await this.prisma.generation.findUnique({ where: { id }, select: { id: true, organizationId: true, createdByUserId: true, type: true, status: true, creditCost: true, errorCode: true, errorMessage: true, createdAt: true, startedAt: true, completedAt: true, failedAt: true, cancelledAt: true, organization: { select: { id: true, name: true } }, createdByUser: { select: { id: true, email: true } }, aiJob: { select: { provider: true, status: true, attempt: true, maxAttempts: true, errorCode: true, errorMessage: true, createdAt: true, startedAt: true, finishedAt: true } }, inputs: { select: { id: true, role: true, asset: { select: { id: true, kind: true, status: true, originalFileName: true, mimeType: true, fileSize: true, width: true, height: true } } } }, outputs: { orderBy: { position: 'asc' }, select: { id: true, position: true, asset: { select: { id: true, kind: true, status: true, originalFileName: true, mimeType: true, fileSize: true, width: true, height: true } } } } } });
    if (!row) throw this.notFound('ADMIN_GENERATION_NOT_FOUND', 'Generation not found');
    return this.serializeDates(row);
  }

  async credits(query: AdminCreditsQueryDto) {
    const search = query.search?.trim();
    const [balances, totals, ledger] = await Promise.all([
      this.prisma.organization.findMany({ where: { ...(query.organizationId ? { id: query.organizationId } : {}), ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { slug: { contains: search, mode: 'insensitive' } }] } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), take: query.limit + 1, select: { id: true, name: true, slug: true, creditBalance: { select: { balance: true, updatedAt: true } } } }),
      this.prisma.creditLedgerEntry.groupBy({ by: ['type'], _sum: { amount: true } }),
      this.prisma.creditLedgerEntry.findMany({ where: query.organizationId ? { organizationId: query.organizationId } : undefined, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30, select: { id: true, organizationId: true, type: true, amount: true, balanceAfter: true, description: true, createdAt: true, createdByUserId: true, organization: { select: { name: true } } } }),
    ]);
    return { balances: this.page(balances, query.limit, (row) => ({ id: row.id, name: row.name, slug: row.slug, balance: row.creditBalance?.balance ?? 0, updatedAt: row.creditBalance?.updatedAt.toISOString() ?? null })), totals: this.creditTotals(totals), recentEntries: ledger.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
  }

  async billing() {
    const [customers, subscriptions, sessions, webhookCounts] = await Promise.all([
      this.prisma.billingCustomer.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, stripeCustomerId: true, createdAt: true, organization: { select: { id: true, name: true } } } }),
      this.prisma.organizationSubscription.findMany({ orderBy: { updatedAt: 'desc' }, take: 100, select: { id: true, planId: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, stripeSubscriptionId: true, organization: { select: { id: true, name: true } } } }),
      this.prisma.billingCheckoutSession.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, selectionId: true, mode: true, status: true, amountTotal: true, currency: true, createdAt: true, organization: { select: { id: true, name: true } } } }),
      this.prisma.stripeWebhookEvent.groupBy({ by: ['type'], _count: { _all: true } }),
    ]);
    const mask = (value: string | null) => value ? `${value.slice(0, 7)}…${value.slice(-4)}` : null;
    return { customers: customers.map((row) => ({ ...row, stripeCustomerReference: mask(row.stripeCustomerId), stripeCustomerId: undefined, createdAt: row.createdAt.toISOString() })), subscriptions: subscriptions.map((row) => ({ ...row, stripeSubscriptionReference: mask(row.stripeSubscriptionId), stripeSubscriptionId: undefined, currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null })), sessions: sessions.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })), webhookCounts: Object.fromEntries(webhookCounts.map((row) => [row.type, row._count._all])) };
  }

  async system() {
    const [database, redis] = await Promise.allSettled([this.prisma.isHealthy(), this.queue.isRedisHealthy()]);
    const prices = this.config.get<Record<string, string>>('billing.prices');
    return { api: 'ok', database: database.status === 'fulfilled' ? 'ok' : 'error', redis: redis.status === 'fulfilled' ? 'ok' : 'error', queue: redis.status === 'fulfilled' ? 'ok' : 'error', environment: this.config.get<string>('app.nodeEnv') ?? 'unknown', aiProviders: this.config.get<Record<string, string>>('ai.providers') ?? {}, storage: { transport: this.config.get<string>('storage.transport') ?? 'unknown', configured: this.config.get<boolean>('storage.configured') ?? false }, billingConfigured: Boolean(this.config.get<string>('billing.secretKey') && prices && Object.values(prices).some(Boolean)) };
  }

  private page<T extends { id: string }, U>(rows: T[], limit: number, map: (row: T) => U) { const hasNextPage = rows.length > limit; const items = hasNextPage ? rows.slice(0, limit) : rows; return { items: items.map(map), pageInfo: { hasNextPage, nextCursor: hasNextPage ? items.at(-1)?.id ?? null : null } }; }
  private creditTotals(rows: Array<{ type: CreditLedgerEntryType; _sum: { amount: number | null } }>) { const value = (type: CreditLedgerEntryType) => rows.find((row) => row.type === type)?._sum.amount ?? 0; return { granted: Math.max(0, value('INITIAL_GRANT')) + Math.max(0, value('SUBSCRIPTION_GRANT')), purchased: Math.max(0, value('CREDIT_PURCHASE')), debited: Math.abs(Math.min(0, value('GENERATION_DEBIT'))), refunded: Math.max(0, value('GENERATION_REFUND')), expired: Math.abs(Math.min(0, value('EXPIRATION'))), adjusted: value('ADMIN_ADJUSTMENT') }; }
  private serializeDates<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
  private notFound(code: string, message: string) { return new NotFoundException({ code, message }); }
}
