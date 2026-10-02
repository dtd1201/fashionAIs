import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Prisma, type CreditLedgerEntryType } from '@prisma/client';
import type {
  CreditBalanceView,
  CreditLedgerEntryView,
  CreditLedgerListResponse,
  CreditUsageSummaryView,
} from '@fashion-ais/types';
import { PrismaService } from '../database/prisma.service';
import { OrganizationAccessService } from '../organizations/organization-access.service';

type Transaction = Prisma.TransactionClient;

@Injectable()
export class CreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
  ) {}

  async getBalance(userId: string, organizationId: string): Promise<CreditBalanceView> {
    await this.access.requireMembership(userId, organizationId);
    const balance = await this.prisma.organizationCreditBalance.findUnique({ where: { organizationId } });
    return { balance: balance?.balance ?? 0, currency: 'credits' };
  }

  async getUsageSummary(userId: string, organizationId: string): Promise<CreditUsageSummaryView> {
    await this.access.requireMembership(userId, organizationId);
    const [balance, totals] = await Promise.all([
      this.prisma.organizationCreditBalance.findUnique({ where: { organizationId } }),
      this.prisma.creditLedgerEntry.groupBy({
        by: ['type'],
        where: { organizationId },
        _sum: { amount: true },
      }),
    ]);
    const amount = (type: CreditLedgerEntryType): number =>
      totals.find((entry) => entry.type === type)?._sum.amount ?? 0;
    return {
      balance: balance?.balance ?? 0,
      usedCredits: Math.abs(Math.min(0, amount('GENERATION_DEBIT'))),
      refundedCredits: Math.max(0, amount('GENERATION_REFUND')),
      grantedCredits: Math.max(0, amount('INITIAL_GRANT')) + Math.max(0, amount('SUBSCRIPTION_GRANT')),
      purchasedCredits: Math.max(0, amount('CREDIT_PURCHASE')),
    };
  }

  async listLedger(userId: string, organizationId: string, limit: number, cursor?: string): Promise<CreditLedgerListResponse> {
    const membership = await this.access.requireMembership(userId, organizationId);
    if (membership.role === 'MEMBER') throw new ForbiddenException({ code: 'CREDIT_LEDGER_FORBIDDEN', message: 'Credit ledger access requires an owner or admin role' });
    const rows = await this.prisma.creditLedgerEntry.findMany({
      where: { organizationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: limit + 1,
    });
    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    return { items: items.map((entry) => this.toView(entry)), pageInfo: { hasNextPage, nextCursor: hasNextPage ? items.at(-1)?.id ?? null : null } };
  }

  async reserveGenerationCredits(transaction: Transaction, input: { organizationId: string; generationId: string; userId: string; cost: number }): Promise<void> {
    if (!Number.isInteger(input.cost) || input.cost < 0) throw new BadRequestException('Invalid generation credit cost');
    if (input.cost === 0) return;
    await transaction.organizationCreditBalance.upsert({ where: { organizationId: input.organizationId }, create: { organizationId: input.organizationId, balance: 0 }, update: {} });
    const updated = await transaction.organizationCreditBalance.updateMany({ where: { organizationId: input.organizationId, balance: { gte: input.cost } }, data: { balance: { decrement: input.cost } } });
    if (updated.count !== 1) {
      const current = await transaction.organizationCreditBalance.findUnique({ where: { organizationId: input.organizationId } });
      throw new HttpException({ code: 'INSUFFICIENT_CREDITS', message: 'Not enough organization credits', details: { requiredCredits: input.cost, availableCredits: current?.balance ?? 0 } }, HttpStatus.PAYMENT_REQUIRED);
    }
    const balance = await transaction.organizationCreditBalance.findUniqueOrThrow({ where: { organizationId: input.organizationId } });
    await transaction.creditLedgerEntry.create({ data: { organizationId: input.organizationId, type: 'GENERATION_DEBIT', amount: -input.cost, balanceAfter: balance.balance, generationId: input.generationId, description: 'Generation credit reservation', idempotencyKey: `generation-debit:${input.generationId}`, createdByUserId: input.userId } });
  }

  async refundGeneration(transaction: Transaction, generationId: string, description: string, requireNoOutputs = false): Promise<boolean> {
    const generation = await transaction.generation.findUnique({ where: { id: generationId } });
    if (!generation || generation.creditCost <= 0 || generation.creditsRefundedAt || generation.status === 'COMPLETED') return false;
    if (requireNoOutputs && await transaction.generationOutputAsset.count({ where: { generationId } }) > 0) return false;
    const key = `generation-refund:${generationId}`;
    if (await transaction.creditLedgerEntry.findUnique({ where: { idempotencyKey: key } })) return false;
    const balance = await transaction.organizationCreditBalance.upsert({ where: { organizationId: generation.organizationId }, create: { organizationId: generation.organizationId, balance: generation.creditCost }, update: { balance: { increment: generation.creditCost } } });
    await transaction.creditLedgerEntry.create({ data: { organizationId: generation.organizationId, type: 'GENERATION_REFUND', amount: generation.creditCost, balanceAfter: balance.balance, generationId, description, idempotencyKey: key } });
    await transaction.generation.update({ where: { id: generationId }, data: { creditsRefundedAt: new Date() } });
    return true;
  }

  async adjust(organizationId: string, userId: string, amount: number, reason: string): Promise<CreditBalanceView> {
    if (!Number.isInteger(amount) || amount === 0) throw new BadRequestException({ code: 'CREDIT_ADJUSTMENT_INVALID', message: 'Amount must be a non-zero integer' });
    return this.prisma.$transaction(async (transaction) => {
      await transaction.organizationCreditBalance.upsert({ where: { organizationId }, create: { organizationId, balance: 0 }, update: {} });
      const changed = amount > 0
        ? await transaction.organizationCreditBalance.updateMany({ where: { organizationId }, data: { balance: { increment: amount } } })
        : await transaction.organizationCreditBalance.updateMany({ where: { organizationId, balance: { gte: -amount } }, data: { balance: { decrement: -amount } } });
      if (changed.count !== 1) throw new BadRequestException({ code: 'CREDIT_BALANCE_NEGATIVE', message: 'Adjustment would make the balance negative' });
      const balance = await transaction.organizationCreditBalance.findUniqueOrThrow({ where: { organizationId } });
      await transaction.creditLedgerEntry.create({ data: { organizationId, type: 'ADMIN_ADJUSTMENT', amount, balanceAfter: balance.balance, description: reason, idempotencyKey: `admin-adjustment:${crypto.randomUUID()}`, createdByUserId: userId } });
      return { balance: balance.balance, currency: 'credits' as const };
    });
  }

  async grant(
    transaction: Transaction,
    input: {
      organizationId: string;
      amount: number;
      type: 'CREDIT_PURCHASE' | 'SUBSCRIPTION_GRANT';
      idempotencyKey: string;
      referenceType: string;
      referenceId: string;
      description: string;
    },
  ): Promise<boolean> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new BadRequestException('Invalid credit grant amount');
    }
    if (await transaction.creditLedgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } })) {
      return false;
    }
    const balance = await transaction.organizationCreditBalance.upsert({
      where: { organizationId: input.organizationId },
      create: { organizationId: input.organizationId, balance: input.amount },
      update: { balance: { increment: input.amount } },
    });
    await transaction.creditLedgerEntry.create({
      data: {
        organizationId: input.organizationId,
        type: input.type,
        amount: input.amount,
        balanceAfter: balance.balance,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return true;
  }

  private toView(entry: { id: string; type: CreditLedgerEntryType; amount: number; balanceAfter: number; generationId: string | null; description: string | null; createdAt: Date }): CreditLedgerEntryView {
    return { ...entry, createdAt: entry.createdAt.toISOString() };
  }
}
