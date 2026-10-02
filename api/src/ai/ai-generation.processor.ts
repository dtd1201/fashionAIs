import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { GenerationStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../storage/storage-provider.interface';
import {
  AiProviderCancelledError,
  AiProviderPermanentError,
  AiProviderTransientError,
} from './ai-provider.interface';
import { AiProviderResolver } from './ai-provider.resolver';
import type { GenerationParameters } from '@fashion-ais/types';
import { CreditsService } from '../credits/credits.service';

export interface AiGenerationJobPayload {
  generationId: string;
  aiJobId: string;
}

class AiOutputStorageError extends Error {}

@Injectable()
export class AiGenerationProcessor {
  private readonly logger = new Logger(AiGenerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly providers: AiProviderResolver,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly credits: CreditsService,
  ) {}

  async process(
    payload: AiGenerationJobPayload,
    attempt: number,
  ): Promise<void> {
    const record = await this.prisma.aIJob.findFirst({
      where: { id: payload.aiJobId, generationId: payload.generationId },
      include: {
        generation: { include: { inputs: { include: { asset: true } } } },
      },
    });
    if (!record || ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(record.status))
      return;
    if (
      record.generation.status === 'CANCEL_REQUESTED' ||
      record.generation.status === 'CANCELLED'
    ) {
      await this.cancel(record.id, record.generationId);
      return;
    }

    const claimed = await this.prisma.$transaction(async (transaction) => {
      const job = await transaction.aIJob.updateMany({
        where: { id: record.id, status: 'QUEUED' },
        data: {
          status: 'PROCESSING',
          attempt,
          startedAt: record.startedAt ?? new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
      if (job.count !== 1) return false;
      const generation = await transaction.generation.updateMany({
        where: { id: record.generationId, status: 'QUEUED' },
        data: {
          status: 'PROCESSING',
          startedAt: record.generation.startedAt ?? new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
      if (generation.count !== 1)
        throw new Error('Generation state changed before claim');
      return true;
    });
    if (!claimed) return;

    const providerStartedAt = Date.now();
    let providerCompleted = false;
    try {
      const provider = this.providers.resolve(record.provider, record.jobType);
      this.logProviderRequest(record, 'start', 0);
      const result = await provider.generate({
        generationId: record.generationId,
        organizationId: record.organizationId,
        type: record.jobType,
        parameters: record.generation.parameters as unknown as GenerationParameters,
        inputs: record.generation.inputs.map((input) => ({
          assetId: input.assetId,
          role: input.role,
          mimeType: input.asset.mimeType,
          bucket: input.asset.bucket,
          objectKey: input.asset.objectKey,
        })),
        providerJobId: record.providerJobId ?? undefined,
        persistProviderJobId: async (providerJobId) => {
          await this.prisma.aIJob.update({
            where: { id: record.id },
            data: { providerJobId },
          });
        },
        isCancellationRequested: () =>
          this.isCancellationRequested(record.generationId),
      });
      this.logProviderRequest(
        record,
        'end',
        Date.now() - providerStartedAt,
      );
      providerCompleted = true;
      if (await this.isCancellationRequested(record.generationId)) {
        await this.cancel(record.id, record.generationId);
        return;
      }

      for (const [position, output] of result.outputs.entries()) {
        const existing = await this.prisma.generationOutputAsset.findUnique({
          where: {
            generationId_position: {
              generationId: record.generationId,
              position,
            },
          },
        });
        if (existing) continue;
        const assetId = this.outputAssetId(record.generationId, position);
        const objectKey = `organizations/${record.organizationId}/generations/${record.generationId}/outputs/${assetId}.${this.extension(output.mimeType)}`;
        const bucket = this.config.getOrThrow<string>('storage.bucket');
        try {
          await this.storage.putObject({
            bucket,
            objectKey,
            body: output.bytes,
            contentType: output.mimeType,
          });
        } catch {
          throw new AiOutputStorageError('Generated output storage failed');
        }
        if (await this.isCancellationRequested(record.generationId)) {
          await this.storage
            .deleteObject(bucket, objectKey)
            .catch(() => undefined);
          await this.cancel(record.id, record.generationId);
          return;
        }
        await this.prisma.$transaction(async (transaction) => {
          const asset = await transaction.asset.upsert({
            where: { id: assetId },
            create: {
              id: assetId,
              organizationId: record.organizationId,
              createdByUserId: record.generation.createdByUserId,
              kind: output.mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE',
              status: 'READY',
              storageProvider: 'R2',
              bucket,
              objectKey,
              originalFileName: output.fileName,
              mimeType: output.mimeType,
              fileSize: output.bytes.byteLength,
              readyAt: new Date(),
            },
            update: {},
          });
          await transaction.generationOutputAsset.upsert({
            where: {
              generationId_position: {
                generationId: record.generationId,
                position,
              },
            },
            create: {
              generationId: record.generationId,
              assetId: asset.id,
              position,
            },
            update: {},
          });
        });
      }

      const completedAt = new Date();
      await this.prisma.$transaction(async (transaction) => {
        await transaction.aIJob.updateMany({
          where: { id: record.id, status: 'PROCESSING' },
          data: {
            status: 'SUCCEEDED',
            providerJobId: result.providerJobId,
            finishedAt: completedAt,
          },
        });
        await transaction.generation.updateMany({
          where: { id: record.generationId, status: { in: ['PROCESSING', 'CANCEL_REQUESTED'] } },
          data: { status: 'COMPLETED', completedAt, creditsFinalizedAt: completedAt },
        });
      });
      this.log(record, attempt, 'complete', 'COMPLETED');
    } catch (error) {
      if (!providerCompleted) {
        this.logProviderRequest(
          record,
          'error',
          Date.now() - providerStartedAt,
          error instanceof AiProviderPermanentError
            ? error.code
            : error instanceof AiProviderTransientError
              ? error.code
              : 'AI_PROVIDER_ERROR',
        );
      }
      if (error instanceof AiProviderCancelledError) {
        await this.cancel(record.id, record.generationId);
        return;
      }
      const permanent = error instanceof AiProviderPermanentError;
      const finalAttempt = permanent || attempt >= record.maxAttempts;
      const errorCode = permanent
        ? error.code
        : error instanceof AiOutputStorageError
          ? 'AI_OUTPUT_STORAGE_FAILED'
          : error instanceof AiProviderTransientError
            ? error.code
            : 'AI_PROVIDER_TRANSIENT_ERROR';
      if (!finalAttempt) {
        await this.prisma.$transaction([
          this.prisma.aIJob.update({
            where: { id: record.id },
            data: {
              status: 'QUEUED',
              attempt,
              errorCode,
              errorMessage: 'Generation attempt failed and will retry',
            },
          }),
          this.prisma.generation.update({
            where: { id: record.generationId },
            data: {
              status: 'QUEUED',
              errorCode,
              errorMessage: 'Generation attempt failed and will retry',
            },
          }),
        ]);
        throw error;
      }
      const failedAt = new Date();
      await this.prisma.$transaction(async (transaction) => {
        await transaction.aIJob.update({
          where: { id: record.id },
          data: {
            status: 'FAILED',
            attempt,
            errorCode,
            errorMessage: 'Generation processing failed',
            finishedAt: failedAt,
          },
        });
        await transaction.generation.update({
          where: { id: record.generationId },
          data: {
            status: 'FAILED',
            errorCode,
            errorMessage: 'Generation processing failed',
            failedAt,
          },
        });
        await this.credits.refundGeneration(transaction, record.generationId, 'Generation failed before completion');
      });
      this.log(record, attempt, 'fail', 'FAILED');
      if (!permanent) throw error;
    }
  }

  private async isCancellationRequested(
    generationId: string,
  ): Promise<boolean> {
    const generation = await this.prisma.generation.findUnique({
      where: { id: generationId },
      select: { status: true },
    });
    return (
      generation?.status === 'CANCEL_REQUESTED' ||
      generation?.status === 'CANCELLED'
    );
  }

  private async cancel(aiJobId: string, generationId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.aIJob.updateMany({
        where: { id: aiJobId, status: { in: ['QUEUED', 'PROCESSING'] } },
        data: { status: 'CANCELLED', finishedAt: now },
      });
      await transaction.generation.updateMany({
        where: {
          id: generationId,
          status: { in: ['QUEUED', 'PROCESSING', 'CANCEL_REQUESTED'] },
        },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
      await this.credits.refundGeneration(transaction, generationId, 'Generation cancelled before output commit', true);
    });
  }

  private outputAssetId(generationId: string, position: number): string {
    const hex = createHash('sha256')
      .update(`${generationId}:${position}`)
      .digest('hex')
      .slice(0, 32)
      .split('');
    hex[12] = '4';
    hex[16] =
      ['8', '9', 'a', 'b'][Number.parseInt(hex[16] ?? '0', 16) % 4] ?? '8';
    return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
  }

  private extension(mimeType: string): string {
    return mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/jpeg'
        ? 'jpg'
        : 'bin';
  }

  private log(
    record: {
      id: string;
      generationId: string;
      organizationId: string;
      provider: string;
    },
    attempt: number,
    operation: string,
    status: GenerationStatus,
  ): void {
    this.logger.log({
      generationId: record.generationId,
      aiJobId: record.id,
      organizationId: record.organizationId,
      provider: record.provider,
      attempt,
      operation,
      status,
    });
  }

  private logProviderRequest(
    record: {
      generationId: string;
      provider: string;
    },
    operation: 'start' | 'end' | 'error',
    latencyMs: number,
    errorCategory?: string,
  ): void {
    this.logger.log({
      generationId: record.generationId,
      provider: record.provider,
      operation: `provider-request-${operation}`,
      latencyMs,
      ...(errorCategory ? { errorCategory } : {}),
    });
  }
}
