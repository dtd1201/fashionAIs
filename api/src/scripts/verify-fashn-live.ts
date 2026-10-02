import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Asset } from '@prisma/client';
import type Redis from 'ioredis';
import { Worker } from 'bullmq';
import {
  AiGenerationProcessor,
  type AiGenerationJobPayload,
} from '../ai/ai-generation.processor';
import { PrismaService } from '../database/prisma.service';
import { GenerationRequestValidator } from '../generations/generation-request.validator';
import { GenerationsService } from '../generations/generations.service';
import { AI_GENERATION_QUEUE, REDIS_CLIENT } from '../queue/queue.constants';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../storage/storage-provider.interface';

const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const LIVE_PARAMETERS = {
  resolution: '1k' as const,
  generation_mode: 'fast' as const,
  num_images: 1,
};

export interface FashnLiveEnvironment {
  FASHN_LIVE_TEST_ENABLED?: string;
  FASHN_LIVE_TEST_DRY_RUN?: string;
  FASHN_API_KEY?: string;
  FASHN_TEST_ORGANIZATION_ID?: string;
  FASHN_TEST_USER_ID?: string;
  FASHN_TEST_PERSON_ASSET_ID?: string;
  FASHN_TEST_GARMENT_ASSET_ID?: string;
  FASHN_LIVE_TEST_TIMEOUT_MS?: string;
}

interface GenerationRecord {
  id: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  aiJob: {
    id: string;
    status: string;
    providerJobId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  } | null;
  outputs: Array<{ asset: Asset }>;
}

export interface FashnLiveDependencies {
  databaseHealthy(): Promise<boolean>;
  redisPing(): Promise<string>;
  storageConfigured(): boolean;
  validateRequest(userId: string, organizationId: string): Promise<void>;
  loadAssets(organizationId: string, assetIds: string[]): Promise<Asset[]>;
  createSignedUrl(asset: Asset): Promise<void>;
  createGeneration(userId: string, organizationId: string, idempotencyKey: string): Promise<{ generationId: string; aiJobId: string }>;
  loadGeneration(generationId: string): Promise<GenerationRecord | null>;
  headOutput(asset: Asset): Promise<{ exists: boolean; contentLength?: number }>;
  sleep(milliseconds: number): Promise<void>;
  now(): number;
  log(message: string): void;
}

export async function verifyFashnLive(
  environment: FashnLiveEnvironment,
  dependencies: FashnLiveDependencies,
): Promise<{ dryRun: boolean; generationId?: string }> {
  const enabled = environment.FASHN_LIVE_TEST_ENABLED === 'true';
  const dryRun = environment.FASHN_LIVE_TEST_DRY_RUN !== 'false';
  if (!enabled) throw new Error('FASHN live verification is disabled');
  if (!dryRun && !environment.FASHN_API_KEY) {
    throw new Error('FASHN_API_KEY is required for paid live verification');
  }

  const organizationId = required(environment.FASHN_TEST_ORGANIZATION_ID, 'FASHN_TEST_ORGANIZATION_ID');
  const userId = required(environment.FASHN_TEST_USER_ID, 'FASHN_TEST_USER_ID');
  const personAssetId = required(environment.FASHN_TEST_PERSON_ASSET_ID, 'FASHN_TEST_PERSON_ASSET_ID');
  const garmentAssetId = required(environment.FASHN_TEST_GARMENT_ASSET_ID, 'FASHN_TEST_GARMENT_ASSET_ID');

  if (!(await dependencies.databaseHealthy())) throw new Error('Database preflight failed');
  dependencies.log('[PRECHECK] database ok');
  if ((await dependencies.redisPing()) !== 'PONG') throw new Error('Redis preflight failed');
  dependencies.log('[PRECHECK] redis ok');
  if (!dependencies.storageConfigured()) throw new Error('Storage/R2 is not configured');
  dependencies.log('[PRECHECK] storage ok');

  await dependencies.validateRequest(userId, organizationId);
  const assets = await dependencies.loadAssets(organizationId, [personAssetId, garmentAssetId]);
  const person = requireAsset(assets, personAssetId, organizationId, 'PERSON');
  const garment = requireAsset(assets, garmentAssetId, organizationId, 'GARMENT');
  await dependencies.createSignedUrl(person);
  await dependencies.createSignedUrl(garment);
  dependencies.log('[PRECHECK] person asset valid');
  dependencies.log('[PRECHECK] garment asset valid');

  dependencies.log(`[PLAN] organization=${organizationId}`);
  dependencies.log(`[PLAN] personAsset=${person.id} mime=${person.mimeType}`);
  dependencies.log(`[PLAN] garmentAsset=${garment.id} mime=${garment.mimeType}`);
  dependencies.log('[PLAN] model=tryon-max resolution=1k generation_mode=fast num_images=1');
  if (dryRun) {
    dependencies.log('FASHN LIVE VERIFICATION DRY RUN PASSED - no generation created');
    return { dryRun: true };
  }

  const runId = `${dependencies.now()}`;
  const created = await dependencies.createGeneration(
    userId,
    organizationId,
    `fashn-live-smoke-${runId}`,
  );
  dependencies.log(`[CREATE] generation=${created.generationId}`);
  dependencies.log(`[QUEUE] aiJob=${created.aiJobId}`);

  const timeout = parseTimeout(environment.FASHN_LIVE_TEST_TIMEOUT_MS);
  const deadline = dependencies.now() + timeout;
  let lastStatus = '';
  while (dependencies.now() <= deadline) {
    const record = await dependencies.loadGeneration(created.generationId);
    if (!record?.aiJob) throw new Error('Live generation record is unavailable');
    if (record.status !== lastStatus) {
      dependencies.log(`[STATUS] ${record.status}`);
      lastStatus = record.status;
    }
    if (record.aiJob.providerJobId) dependencies.log(`[FASHN] prediction=${record.aiJob.providerJobId}`);
    if (record.status === 'FAILED' || record.status === 'CANCELLED') {
      throw new Error(failureReport(record));
    }
    if (record.status === 'COMPLETED') {
      await verifyOutput(record, organizationId, dependencies);
      dependencies.log('LIVE FASHN SMOKE TEST PASSED');
      return { dryRun: false, generationId: record.id };
    }
    await dependencies.sleep(2000);
  }

  const current = await dependencies.loadGeneration(created.generationId);
  throw new Error(
    `Live verification timed out: generationId=${created.generationId} aiJobId=${created.aiJobId} status=${current?.status ?? 'UNKNOWN'} providerJobId=${current?.aiJob?.providerJobId ?? 'none'}`,
  );
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function requireAsset(
  assets: Asset[],
  assetId: string,
  organizationId: string,
  role: string,
): Asset {
  const asset = assets.find((item) => item.id === assetId);
  if (!asset || asset.organizationId !== organizationId)
    throw new Error(`${role} asset is invalid or belongs to another organization`);
  if (asset.status !== 'READY') throw new Error(`${role} asset is not READY`);
  if (asset.kind !== 'IMAGE' || !SUPPORTED_MIME_TYPES.has(asset.mimeType))
    throw new Error(`${role} asset must be a supported image`);
  return asset;
}

function parseTimeout(value?: string): number {
  const parsed = Number(value ?? 180000);
  if (!Number.isInteger(parsed) || parsed < 1000 || parsed > 600000)
    throw new Error('FASHN_LIVE_TEST_TIMEOUT_MS must be between 1000 and 600000');
  return parsed;
}

function failureReport(record: GenerationRecord): string {
  return `Live generation failed: generationId=${record.id} aiJobId=${record.aiJob?.id ?? 'none'} providerJobId=${record.aiJob?.providerJobId ?? 'none'} generationStatus=${record.status} aiJobStatus=${record.aiJob?.status ?? 'UNKNOWN'} errorCode=${record.errorCode ?? record.aiJob?.errorCode ?? 'none'} errorMessage=${record.errorMessage ?? record.aiJob?.errorMessage ?? 'none'}`;
}

async function verifyOutput(
  record: GenerationRecord,
  organizationId: string,
  dependencies: FashnLiveDependencies,
): Promise<void> {
  if (record.aiJob?.status !== 'SUCCEEDED' || !record.aiJob.providerJobId)
    throw new Error('Completed generation has an invalid AIJob');
  if (record.outputs.length !== 1) throw new Error('Live verification expected exactly one output');
  const asset = record.outputs[0].asset;
  if (asset.organizationId !== organizationId || asset.status !== 'READY' || asset.kind !== 'IMAGE')
    throw new Error('Generated output Asset is invalid');
  const stored = await dependencies.headOutput(asset);
  if (!stored.exists || (stored.contentLength !== undefined && stored.contentLength !== asset.fileSize))
    throw new Error('Generated output storage object is unavailable');
  dependencies.log('[VERIFY] output asset READY');
  dependencies.log('[VERIFY] storage object exists');
}

async function main(): Promise<void> {
  const dryRun = process.env.FASHN_LIVE_TEST_DRY_RUN !== 'false';
  if (process.env.FASHN_LIVE_TEST_ENABLED !== 'true')
    throw new Error('FASHN live verification is disabled');
  if (!dryRun && !process.env.FASHN_API_KEY)
    throw new Error('FASHN_API_KEY is required for paid live verification');
  process.env.AI_VIRTUAL_TRY_ON_PROVIDER = dryRun ? 'mock' : 'fashn';
  const { AppModule } = await import('../app.module');
  const context = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
  const prisma = context.get(PrismaService);
  const redis = context.get<Redis>(REDIS_CLIENT);
  const storage = context.get<StorageProvider>(STORAGE_PROVIDER);
  const config = context.get(ConfigService);
  const validator = context.get(GenerationRequestValidator);
  const generations = context.get(GenerationsService);
  const processor = context.get(AiGenerationProcessor);
  const personAssetId = process.env.FASHN_TEST_PERSON_ASSET_ID ?? '';
  const garmentAssetId = process.env.FASHN_TEST_GARMENT_ASSET_ID ?? '';
  const worker = dryRun
    ? undefined
    : new Worker(
        AI_GENERATION_QUEUE,
        (job) =>
          processor.process(
            job.data as AiGenerationJobPayload,
            job.attemptsMade + 1,
          ),
        {
          connection: {
            host: config.getOrThrow<string>('redis.host'),
            port: config.getOrThrow<number>('redis.port'),
            password: config.get<string>('redis.password'),
          },
        },
      );
  try {
    await verifyFashnLive(process.env, {
      databaseHealthy: () => prisma.isHealthy(),
      redisPing: () => redis.ping(),
      storageConfigured: () => config.get<boolean>('storage.configured') === true,
      validateRequest: async (userId, organizationId) => {
        await validator.validate(userId, organizationId, {
          type: 'VIRTUAL_TRY_ON',
          inputs: [
            { assetId: personAssetId, role: 'PERSON' },
            { assetId: garmentAssetId, role: 'GARMENT' },
          ],
          parameters: LIVE_PARAMETERS,
        });
      },
      loadAssets: (organizationId, assetIds) =>
        prisma.asset.findMany({ where: { organizationId, id: { in: assetIds } } }),
      createSignedUrl: async (asset) => {
        await storage.createPresignedDownload(asset.bucket, asset.objectKey, 900);
      },
      createGeneration: async (userId, organizationId, idempotencyKey) => {
        const result = await generations.create(
          userId,
          organizationId,
          {
            type: 'VIRTUAL_TRY_ON',
            inputs: [
              { assetId: personAssetId, role: 'PERSON' },
              { assetId: garmentAssetId, role: 'GARMENT' },
            ],
            parameters: LIVE_PARAMETERS,
          },
          idempotencyKey,
        );
        return { generationId: result.generation.id, aiJobId: result.job.id };
      },
      loadGeneration: (generationId) =>
        prisma.generation.findUnique({
          where: { id: generationId },
          include: { aiJob: true, outputs: { include: { asset: true }, orderBy: { position: 'asc' } } },
        }),
      headOutput: (asset) => storage.headObject(asset.bucket, asset.objectKey),
      sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
      now: () => Date.now(),
      log: (message) => console.log(message),
    });
  } finally {
    await worker?.close(true);
    await context.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Live verification failed';
    const secret = process.env.FASHN_API_KEY;
    console.error(secret ? message.replaceAll(secret, '[REDACTED]') : message);
    process.exitCode = 1;
  });
}
