import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Prisma,
  type AIJob,
  type Asset,
  type Generation,
} from '@prisma/client';
import type {
  AIJobView,
  AssetView,
  CancelGenerationResponse,
  CreateGenerationResponse,
  GenerationDetail,
  GenerationListResponse,
  GenerationView,
  CreateGenerationRequest,
  GenerationParameters,
} from '@fashion-ais/types';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import { QueueService } from '../queue/queue.service';
import { AiProviderResolver } from '../ai/ai-provider.resolver';
import { CreditsService } from '../credits/credits.service';
import { GenerationCostService } from '../credits/generation-cost.service';
import type { ListGenerationsDto } from './dto/list-generations.dto';

@Injectable()
export class GenerationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
    private readonly queue: QueueService,
    private readonly config: ConfigService,
    private readonly providers: AiProviderResolver,
    private readonly credits: CreditsService,
    private readonly costs: GenerationCostService,
  ) {}

  async create(
    userId: string,
    organizationId: string,
    request: CreateGenerationRequest,
    idempotencyKey?: string,
  ): Promise<CreateGenerationResponse> {
    await this.access.requireMembership(userId, organizationId);
    const key = this.validateIdempotencyKey(idempotencyKey);
    const fingerprint = this.fingerprint({
      type: request.type,
      inputs: request.inputs,
      parameters: request.parameters,
    });
    if (key) {
      const existing = await this.prisma.generation.findFirst({
        where: { organizationId, createdByUserId: userId, idempotencyKey: key },
        include: { aiJob: true },
      });
      if (existing) {
        if (existing.requestFingerprint !== fingerprint)
          throw new ConflictException({
            code: 'GENERATION_IDEMPOTENCY_CONFLICT',
            message: 'Idempotency key was used for a different request',
          });
        return {
          generation: this.toView(existing),
          job: this.toJobView(this.requireJob(existing.aiJob)),
        };
      }
    }

    const maxAttempts = this.config.getOrThrow<number>('ai.maxAttempts');
    const provider = this.providers.providerForType(request.type);
    const creditCost = this.costs.calculate(request);
    const created = await this.prisma.$transaction(async (transaction) => {
      const generation = await transaction.generation.create({
        data: {
          organizationId,
          createdByUserId: userId,
          type: request.type,
          parameters: request.parameters as Prisma.InputJsonValue,
          idempotencyKey: key,
          requestFingerprint: key ? fingerprint : null,
          creditCost,
          creditsReservedAt: creditCost > 0 ? new Date() : null,
          inputs: {
            create: request.inputs.map((input) => ({
              assetId: input.assetId,
              role: input.role,
            })),
          },
        },
      });
      await this.credits.reserveGenerationCredits(transaction, {
        organizationId,
        generationId: generation.id,
        userId,
        cost: creditCost,
      });
      const job = await transaction.aIJob.create({
        data: {
          generationId: generation.id,
          organizationId,
          jobType: request.type,
          provider,
          maxAttempts,
        },
      });
      return { generation, job };
    });

    try {
      const queueJobId = await this.queue.enqueueGeneration(
        { generationId: created.generation.id, aiJobId: created.job.id },
        {
          attempts: maxAttempts,
          backoffMs: this.config.getOrThrow<number>('ai.backoffMs'),
        },
      );
      const job = await this.prisma.aIJob.update({
        where: { id: created.job.id },
        data: { queueJobId },
      });
      return {
        generation: this.toView(created.generation),
        job: this.toJobView(job),
      };
    } catch {
      const failedAt = new Date();
      await this.prisma.$transaction(async (transaction) => {
        await transaction.generation.update({
          where: { id: created.generation.id },
          data: {
            status: 'FAILED',
            errorCode: 'AI_JOB_FAILED',
            errorMessage: 'Generation could not be queued',
            failedAt,
          },
        });
        await transaction.aIJob.update({
          where: { id: created.job.id },
          data: {
            status: 'FAILED',
            errorCode: 'AI_JOB_FAILED',
            errorMessage: 'Generation could not be queued',
            finishedAt: failedAt,
          },
        });
        await this.credits.refundGeneration(transaction, created.generation.id, 'Generation queue insertion failed');
      });
      throw new ServiceUnavailableException({
        code: 'AI_JOB_FAILED',
        message: 'Generation could not be queued',
      });
    }
  }

  async get(
    userId: string,
    organizationId: string,
    generationId: string,
  ): Promise<GenerationDetail> {
    await this.access.requireMembership(userId, organizationId);
    const generation = await this.prisma.generation.findFirst({
      where: { id: generationId, organizationId },
      include: {
        inputs: { include: { asset: true } },
        outputs: { include: { asset: true }, orderBy: { position: 'asc' } },
        aiJob: true,
      },
    });
    if (!generation) throw this.notFound();
    return {
      ...this.toView(generation),
      inputs: generation.inputs.map((input) => ({
        id: input.id,
        role: input.role,
        asset: this.toAssetView(input.asset),
      })),
      outputs: generation.outputs.map((output) => ({
        id: output.id,
        position: output.position,
        asset: this.toAssetView(output.asset),
      })),
      job: this.toJobView(this.requireJob(generation.aiJob)),
    };
  }

  async list(
    userId: string,
    organizationId: string,
    query: ListGenerationsDto,
  ): Promise<GenerationListResponse> {
    await this.access.requireMembership(userId, organizationId);
    const rows = await this.prisma.generation.findMany({
      where: {
        organizationId,
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit + 1,
      include: {
        inputs: { include: { asset: true } },
        outputs: { include: { asset: true }, orderBy: { position: 'asc' } },
        aiJob: true,
      },
    });
    const hasNextPage = rows.length > query.limit;
    const items = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      items: items.map((row) => ({
        ...this.toView(row),
        inputs: row.inputs.map((input) => ({
          id: input.id,
          role: input.role,
          asset: this.toAssetView(input.asset),
        })),
        outputs: row.outputs.map((output) => ({
          id: output.id,
          position: output.position,
          asset: this.toAssetView(output.asset),
        })),
        job: this.toJobView(this.requireJob(row.aiJob)),
      })),
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage ? (items.at(-1)?.id ?? null) : null,
      },
    };
  }

  async cancel(
    userId: string,
    organizationId: string,
    generationId: string,
  ): Promise<CancelGenerationResponse> {
    await this.access.requireMembership(userId, organizationId);
    const generation = await this.prisma.generation.findFirst({
      where: { id: generationId, organizationId },
      include: { aiJob: true },
    });
    if (!generation) throw this.notFound();
    const job = this.requireJob(generation.aiJob);
    if (generation.status === 'CANCELLED')
      return { generation: this.toView(generation), job: this.toJobView(job) };
    if (generation.status === 'COMPLETED' || generation.status === 'FAILED')
      throw new ConflictException({
        code: 'GENERATION_CANCEL_NOT_ALLOWED',
        message: 'Generation can no longer be cancelled',
      });
    const now = new Date();
    if (generation.status === 'QUEUED') {
      const { nextGeneration, nextJob } = await this.prisma.$transaction(async (transaction) => {
        const nextGeneration = await transaction.generation.update({
          where: { id: generation.id },
          data: { status: 'CANCELLED', cancelledAt: now },
        });
        const nextJob = await transaction.aIJob.update({
          where: { id: job.id },
          data: { status: 'CANCELLED', finishedAt: now },
        });
        await this.credits.refundGeneration(transaction, generation.id, 'Queued generation cancelled', true);
        return { nextGeneration, nextJob };
      });
      return {
        generation: this.toView(nextGeneration),
        job: this.toJobView(nextJob),
      };
    }
    const nextGeneration =
      generation.status === 'CANCEL_REQUESTED'
        ? generation
        : await this.prisma.generation.update({
            where: { id: generation.id },
            data: { status: 'CANCEL_REQUESTED' },
          });
    return {
      generation: this.toView(nextGeneration),
      job: this.toJobView(job),
    };
  }

  private validateIdempotencyKey(value?: string): string | undefined {
    if (!value) return undefined;
    const key = value.trim();
    if (!key || key.length > 128)
      throw new BadRequestException({
        code: 'GENERATION_INVALID_INPUT',
        message: 'Invalid Idempotency-Key',
      });
    return key;
  }

  private fingerprint(value: unknown): string {
    const normalize = (item: unknown): unknown =>
      Array.isArray(item)
        ? item.map(normalize)
        : item && typeof item === 'object'
          ? Object.fromEntries(
              Object.entries(item)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, child]) => [key, normalize(child)]),
            )
          : item;
    return createHash('sha256')
      .update(JSON.stringify(normalize(value)))
      .digest('hex');
  }

  private toView(generation: Generation): GenerationView {
    return {
      id: generation.id,
      organizationId: generation.organizationId,
      type: generation.type,
      status: generation.status,
      parameters: generation.parameters as unknown as GenerationParameters,
      errorCode: generation.errorCode,
      errorMessage: this.safeFailureMessage(generation.status),
      startedAt: generation.startedAt?.toISOString() ?? null,
      completedAt: generation.completedAt?.toISOString() ?? null,
      failedAt: generation.failedAt?.toISOString() ?? null,
      cancelledAt: generation.cancelledAt?.toISOString() ?? null,
      createdAt: generation.createdAt.toISOString(),
      updatedAt: generation.updatedAt.toISOString(),
      creditCost: generation.creditCost,
    };
  }

  private toJobView(job: AIJob): AIJobView {
    return {
      id: job.id,
      status: job.status,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      errorCode: job.errorCode,
      errorMessage:
        job.status === 'FAILED'
          ? 'This generation job could not be completed.'
          : null,
      provider: job.provider,
    };
  }

  private safeFailureMessage(status: Generation['status']): string | null {
    return status === 'FAILED'
      ? 'This generation could not be completed. Please try again or adjust your inputs.'
      : null;
  }

  private toAssetView(asset: Asset): AssetView {
    return {
      id: asset.id,
      organizationId: asset.organizationId,
      kind: asset.kind,
      status: asset.status,
      originalFileName: asset.originalFileName,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      width: asset.width,
      height: asset.height,
      durationSeconds: asset.durationSeconds,
      checksumSha256: asset.checksumSha256,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
      readyAt: asset.readyAt?.toISOString() ?? null,
      deletedAt: asset.deletedAt?.toISOString() ?? null,
    };
  }

  private requireJob(job: AIJob | null): AIJob {
    if (!job)
      throw new ConflictException({
        code: 'AI_JOB_FAILED',
        message: 'Generation job is unavailable',
      });
    return job;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'GENERATION_NOT_FOUND',
      message: 'Generation not found',
    });
  }
}
