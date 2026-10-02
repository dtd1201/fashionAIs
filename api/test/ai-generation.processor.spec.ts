/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { AiGenerationProcessor } from '../src/ai/ai-generation.processor';
import {
  AiProviderPermanentError,
  AiProviderTransientError,
} from '../src/ai/ai-provider.interface';

const now = new Date('2026-10-01T00:00:00Z');

function harness() {
  const generation = {
    id: 'generation-id',
    organizationId: 'organization-id',
    createdByUserId: 'user-id',
    type: 'IMAGE_GENERATION',
    status: 'QUEUED',
    parameters: {},
    errorCode: null,
    errorMessage: null,
    startedAt: null as Date | null,
    completedAt: null as Date | null,
    failedAt: null as Date | null,
    cancelledAt: null as Date | null,
    createdAt: now,
    updatedAt: now,
    inputs: [
      { assetId: 'input-id', role: 'SOURCE', asset: { mimeType: 'image/png' } },
    ],
  };
  const job = {
    id: 'job-id',
    generationId: generation.id,
    organizationId: generation.organizationId,
    provider: 'MOCK',
    jobType: generation.type,
    status: 'QUEUED',
    attempt: 0,
    maxAttempts: 3,
    startedAt: null as Date | null,
    finishedAt: null as Date | null,
    errorCode: null as string | null,
    errorMessage: null as string | null,
  };
  const outputAssets: Array<Record<string, unknown>> = [];
  const outputs: Array<Record<string, unknown>> = [];
  const apply = (
    target: Record<string, unknown>,
    data: Record<string, unknown>,
  ) => {
    Object.assign(target, data);
    return target;
  };
  const transactionClient: { value?: unknown } = {};
  const prisma = {
    aIJob: {
      findFirst: jest.fn(() => ({ ...job, generation })),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { status?: string | { in: string[] } };
          data: Record<string, unknown>;
        }) => {
          const allowed =
            !where.status ||
            (typeof where.status === 'string'
              ? job.status === where.status
              : where.status.in.includes(job.status));
          if (!allowed) return { count: 0 };
          apply(job, data);
          return { count: 1 };
        },
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        apply(job, data),
      ),
    },
    generation: {
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { status?: string | { in: string[] } };
          data: Record<string, unknown>;
        }) => {
          const allowed =
            !where.status ||
            (typeof where.status === 'string'
              ? generation.status === where.status
              : where.status.in.includes(generation.status));
          if (!allowed) return { count: 0 };
          apply(generation, data);
          return { count: 1 };
        },
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        apply(generation, data),
      ),
      findUnique: jest.fn(() => ({ status: generation.status })),
    },
    generationOutputAsset: {
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: { generationId_position: { position: number } };
        }) =>
          outputs.find(
            (value) => value.position === where.generationId_position.position,
          ) ?? null,
      ),
      upsert: jest.fn(({ create }: { create: Record<string, unknown> }) => {
        const existing = outputs.find(
          (value) => value.position === create.position,
        );
        if (existing) return existing;
        outputs.push(create);
        return create;
      }),
    },
    asset: {
      upsert: jest.fn(({ create }: { create: Record<string, unknown> }) => {
        const existing = outputAssets.find((value) => value.id === create.id);
        if (existing) return existing;
        outputAssets.push(create);
        return create;
      }),
    },
    $transaction: jest.fn((value: unknown): unknown =>
      typeof value === 'function'
        ? (value as (client: unknown) => unknown)(transactionClient.value)
        : Promise.all(value as Promise<unknown>[]),
    ),
  };
  transactionClient.value = prisma;
  const provider = {
    provider: 'MOCK',
    supports: jest.fn(() => true),
    generate: jest.fn().mockResolvedValue({
      providerJobId: 'mock-job',
      outputs: [
        {
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: 'image/png',
          fileName: 'mock.png',
        },
      ],
    }),
  };
  const providers = { resolve: jest.fn(() => provider) };
  const storage = {
    putObject: jest.fn().mockResolvedValue(undefined),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    getOrThrow: jest.fn((key: string) =>
      key === 'storage.bucket' ? 'bucket' : 30000,
    ),
  };
  const credits = { refundGeneration: jest.fn().mockResolvedValue(true) };
  return {
    processor: new AiGenerationProcessor(
      prisma as never,
      config as never,
      providers as never,
      storage as never,
      credits as never,
    ),
    generation,
    job,
    provider,
    storage,
    outputAssets,
    outputs,
    credits,
  };
}

describe('AiGenerationProcessor', () => {
  it('claims queued work, stores output, links one READY Asset, and completes', async () => {
    const state = harness();
    await state.processor.process(
      { generationId: 'generation-id', aiJobId: 'job-id' },
      1,
    );
    expect(state.provider.generate).toHaveBeenCalledTimes(1);
    expect(state.storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'bucket',
        contentType: 'image/png',
        body: expect.any(Uint8Array),
      }),
    );
    expect(state.outputAssets).toHaveLength(1);
    expect(state.outputAssets[0]?.organizationId).toBe('organization-id');
    expect(state.outputAssets[0]?.status).toBe('READY');
    expect(state.outputs).toHaveLength(1);
    expect(state.job.status).toBe('SUCCEEDED');
    expect(state.generation.status).toBe('COMPLETED');
    expect(state.generation.completedAt).toBeInstanceOf(Date);
    expect(state.credits.refundGeneration).not.toHaveBeenCalled();
  });

  it('bounded transient failure resets for retry and later succeeds', async () => {
    const state = harness();
    state.provider.generate
      .mockRejectedValueOnce(new AiProviderTransientError('temporary'))
      .mockResolvedValueOnce({ outputs: [] });
    await expect(
      state.processor.process(
        { generationId: 'generation-id', aiJobId: 'job-id' },
        1,
      ),
    ).rejects.toBeInstanceOf(AiProviderTransientError);
    expect(state.job.status).toBe('QUEUED');
    expect(state.generation.status).toBe('QUEUED');
    await state.processor.process(
      { generationId: 'generation-id', aiJobId: 'job-id' },
      2,
    );
    expect(state.job.status).toBe('SUCCEEDED');
    expect(state.generation.status).toBe('COMPLETED');
  });

  it('final/permanent failure stores safe errors and never creates output', async () => {
    const state = harness();
    state.provider.generate.mockRejectedValue(
      new AiProviderPermanentError('secret stack'),
    );
    await state.processor.process(
      { generationId: 'generation-id', aiJobId: 'job-id' },
      1,
    );
    expect(state.job.status).toBe('FAILED');
    expect(state.generation.status).toBe('FAILED');
    expect(state.job.errorCode).toBe('AI_PROVIDER_PERMANENT_ERROR');
    expect(state.job.errorMessage).not.toContain('secret');
    expect(state.outputAssets).toHaveLength(0);
    expect(state.credits.refundGeneration).toHaveBeenCalledTimes(1);
  });

  it('storage failure prevents completion and READY metadata', async () => {
    const state = harness();
    state.storage.putObject.mockRejectedValue(new Error('storage unavailable'));
    await expect(
      state.processor.process(
        { generationId: 'generation-id', aiJobId: 'job-id' },
        3,
      ),
    ).rejects.toThrow();
    expect(state.generation.status).toBe('FAILED');
    expect(state.job.errorCode).toBe('AI_OUTPUT_STORAGE_FAILED');
    expect(state.outputAssets).toHaveLength(0);
    expect(state.credits.refundGeneration).toHaveBeenCalledTimes(1);
  });

  it('honors cancellation before provider and before output commit', async () => {
    const first = harness();
    first.generation.status = 'CANCEL_REQUESTED';
    await first.processor.process(
      { generationId: 'generation-id', aiJobId: 'job-id' },
      1,
    );
    expect(first.provider.generate).not.toHaveBeenCalled();
    expect(first.generation.status).toBe('CANCELLED');
    expect(first.credits.refundGeneration).toHaveBeenCalledTimes(1);
    const second = harness();
    second.provider.generate.mockImplementation(() => {
      second.generation.status = 'CANCEL_REQUESTED';
      return Promise.resolve({
        outputs: [
          { bytes: new Uint8Array([1]), mimeType: 'image/png', fileName: 'x' },
        ],
      });
    });
    await second.processor.process(
      { generationId: 'generation-id', aiJobId: 'job-id' },
      1,
    );
    expect(second.storage.putObject).not.toHaveBeenCalled();
    expect(second.generation.status).toBe('CANCELLED');
  });

  it('duplicate concurrent processing claims once and terminal reruns do nothing', async () => {
    const state = harness();
    await Promise.all([
      state.processor.process(
        { generationId: 'generation-id', aiJobId: 'job-id' },
        1,
      ),
      state.processor.process(
        { generationId: 'generation-id', aiJobId: 'job-id' },
        1,
      ),
    ]);
    await state.processor.process(
      { generationId: 'generation-id', aiJobId: 'job-id' },
      2,
    );
    expect(state.provider.generate).toHaveBeenCalledTimes(1);
    expect(state.outputs).toHaveLength(1);
    expect(state.outputAssets).toHaveLength(1);
    expect(state.generation.status).toBe('COMPLETED');
  });
});
