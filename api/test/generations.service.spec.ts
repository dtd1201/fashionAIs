/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGenerationDto } from '../src/generations/dto/create-generation.dto';
import { GenerationsService } from '../src/generations/generations.service';
import { OrganizationAccessService } from '../src/organizations/organization-access.service';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const assetId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-10-01T00:00:00Z');

function harness(role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'MEMBER') {
  const generations: Array<Record<string, unknown>> = [];
  const jobs: Array<Record<string, unknown>> = [];
  const assets = [{ id: assetId, organizationId, status: 'READY' }];
  const transaction = {
    generation: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const value = {
          id: 'generation-id',
          status: 'QUEUED',
          errorCode: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          failedAt: null,
          cancelledAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        generations.push(value);
        return value;
      }),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Object.assign(generations[0] ?? {}, data),
      ),
    },
    aIJob: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const value = {
          id: 'job-id',
          status: 'QUEUED',
          provider: 'MOCK',
          queueJobId: null,
          providerJobId: null,
          attempt: 0,
          errorCode: null,
          errorMessage: null,
          startedAt: null,
          finishedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        jobs.push(value);
        return value;
      }),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Object.assign(jobs[0] ?? {}, data),
      ),
    },
  };
  const prisma = {
    organizationMember: {
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: {
            userId_organizationId: { userId: string; organizationId: string };
          };
        }) =>
          where.userId_organizationId.userId === userId &&
          where.userId_organizationId.organizationId === organizationId
            ? { id: 'membership', userId, organizationId, role }
            : null,
      ),
    },
    asset: {
      findMany: jest.fn(
        ({
          where,
        }: {
          where: { id: { in: string[] }; organizationId: string };
        }) =>
          assets.filter(
            (asset) =>
              where.id.in.includes(asset.id) &&
              asset.organizationId === where.organizationId,
          ),
      ),
    },
    generation: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        const found = generations.find((value) =>
          Object.entries(where).every(
            ([key, expected]) => value[key] === expected,
          ),
        );
        return found ? { ...found, aiJob: jobs[0] ?? null } : null;
      }),
      findMany: jest.fn((args?: { take?: number }) => {
        void args;
        return generations;
      }),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Object.assign(generations[0] ?? {}, data),
      ),
    },
    aIJob: {
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Object.assign(jobs[0] ?? {}, data),
      ),
    },
    $transaction: jest.fn((value: unknown) =>
      typeof value === 'function'
        ? (value as (client: typeof transaction) => unknown)(transaction)
        : Promise.all(value as Promise<unknown>[]),
    ),
  };
  const queue = {
    enqueueGeneration: jest.fn().mockResolvedValue('ai-job-job-id'),
  };
  const config = {
    getOrThrow: jest.fn(
      (key: string) => ({ 'ai.maxAttempts': 3, 'ai.backoffMs': 5000 })[key],
    ),
  };
  const providers = { providerForType: jest.fn(() => 'MOCK') };
  const credits = {
    reserveGenerationCredits: jest.fn().mockResolvedValue(undefined),
    refundGeneration: jest.fn().mockResolvedValue(true),
  };
  const costs = { calculate: jest.fn(() => 1) };
  const access = new OrganizationAccessService(prisma as never);
  return {
    service: new GenerationsService(
      prisma as never,
      access,
      queue as never,
      config as never,
      providers as never,
      credits as never,
      costs,
    ),
    queue,
    transaction,
    generations,
    jobs,
    assets,
    credits,
    costs,
    prisma,
  };
}

const input = {
  type: 'IMAGE_GENERATION' as const,
  inputs: [{ assetId, role: 'SOURCE' as const }],
  parameters: { prompt: 'A studio fashion portrait' },
};

describe('GenerationsService creation', () => {
  it.each(['OWNER', 'ADMIN', 'MEMBER'] as const)(
    '%s creates database records and queues IDs only',
    async (role) => {
      const { service, queue, transaction, credits } = harness(role);
      const result = await service.create(userId, organizationId, input);
      expect(result.generation.status).toBe('QUEUED');
      expect(transaction.generation.create).toHaveBeenCalled();
      expect(transaction.aIJob.create).toHaveBeenCalled();
      expect(credits.reserveGenerationCredits).toHaveBeenCalledWith(
        transaction,
        expect.objectContaining({ organizationId, cost: 1 }),
      );
      expect(queue.enqueueGeneration).toHaveBeenCalledWith(
        { generationId: 'generation-id', aiJobId: 'job-id' },
        { attempts: 3, backoffMs: 5000 },
      );
    },
  );

  it('returns 404 to an outsider', async () => {
    const { service } = harness();
    await expect(
      service.create('outsider', organizationId, input),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ORGANIZATION_NOT_FOUND' }),
    });
  });

  it('reuses matching idempotency keys and rejects changed requests', async () => {
    const state = harness();
    const first = await state.service.create(
      userId,
      organizationId,
      input,
      'same-key',
    );
    const same = await state.service.create(
      userId,
      organizationId,
      input,
      'same-key',
    );
    expect(same.generation.id).toBe(first.generation.id);
    expect(state.queue.enqueueGeneration).toHaveBeenCalledTimes(1);
    expect(state.credits.reserveGenerationCredits).toHaveBeenCalledTimes(1);
    await expect(
      state.service.create(
        userId,
        organizationId,
        { ...input, parameters: { prompt: 'A different portrait' } },
        'same-key',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'GENERATION_IDEMPOTENCY_CONFLICT',
      }),
    });
  });

  it('does not enqueue when the atomic credit reservation rejects', async () => {
    const state = harness();
    state.credits.reserveGenerationCredits.mockRejectedValueOnce({
      status: 402,
      response: {
        code: 'INSUFFICIENT_CREDITS',
        details: { requiredCredits: 1, availableCredits: 0 },
      },
    });
    await expect(state.service.create(userId, organizationId, input)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INSUFFICIENT_CREDITS',
        details: { requiredCredits: 1, availableCredits: 0 },
      }),
    });
    expect(state.queue.enqueueGeneration).not.toHaveBeenCalled();
  });

  it('marks records failed when queue insertion fails', async () => {
    const state = harness();
    state.queue.enqueueGeneration.mockRejectedValueOnce(
      new Error('redis unavailable'),
    );
    await expect(
      state.service.create(userId, organizationId, input),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AI_JOB_FAILED' }),
    });
    expect(state.generations[0]?.status).toBe('FAILED');
    expect(state.jobs[0]?.status).toBe('FAILED');
    expect(state.credits.refundGeneration).toHaveBeenCalledTimes(1);
  });

  it('strict DTO rejects invalid type/too many inputs', async () => {
    const invalid = plainToInstance(CreateGenerationDto, {
      type: 'INVALID',
      inputs: Array.from({ length: 11 }, () => ({ assetId, role: 'SOURCE' })),
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });
});

describe('GenerationsService cancellation', () => {
  it('cancels QUEUED generation and is idempotent once CANCELLED', async () => {
    const state = harness();
    await state.service.create(userId, organizationId, input);
    const first = await state.service.cancel(
      userId,
      organizationId,
      'generation-id',
    );
    expect(first.generation.status).toBe('CANCELLED');
    expect(first.job.status).toBe('CANCELLED');
    await expect(
      state.service.cancel(userId, organizationId, 'generation-id'),
    ).resolves.toEqual(
      expect.objectContaining({
        generation: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
  });

  it('sets PROCESSING generation to CANCEL_REQUESTED', async () => {
    const state = harness();
    await state.service.create(userId, organizationId, input);
    state.generations[0].status = 'PROCESSING';
    state.jobs[0].status = 'PROCESSING';
    const result = await state.service.cancel(
      userId,
      organizationId,
      'generation-id',
    );
    expect(result.generation.status).toBe('CANCEL_REQUESTED');
  });

  it.each(['COMPLETED', 'FAILED'] as const)(
    'does not cancel terminal %s generation',
    async (status) => {
      const state = harness();
      await state.service.create(userId, organizationId, input);
      state.generations[0].status = status;
      await expect(
        state.service.cancel(userId, organizationId, 'generation-id'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'GENERATION_CANCEL_NOT_ALLOWED',
        }),
      });
    },
  );
});

describe('GenerationsService history', () => {
  const fullAsset = (id: string) => ({
    id, organizationId, createdByUserId: userId, kind: 'IMAGE', status: 'READY',
    storageProvider: 'R2', bucket: 'private', objectKey: `private/${id}`,
    originalFileName: `${id}.jpg`, mimeType: 'image/jpeg', fileSize: 1,
    width: null, height: null, durationSeconds: null, checksumSha256: null,
    createdAt: now, updatedAt: now, readyAt: now, deletedAt: null,
  });

  it('returns organization-scoped associations, provider, credit cost, and sanitized failures', async () => {
    const state = harness();
    await state.service.create(userId, organizationId, input);
    Object.assign(state.generations[0], {
      status: 'FAILED', creditCost: 3,
      errorMessage: 'provider secret and https://signed.example/object',
      inputs: [{ id: 'input-link', role: 'PERSON', asset: fullAsset('person') }],
      outputs: [{ id: 'output-link', position: 0, asset: fullAsset('output') }],
    });
    state.prisma.generation.findMany.mockImplementation(() => state.generations.map((generation) => ({ ...generation, aiJob: state.jobs[0], inputs: generation.inputs ?? [], outputs: generation.outputs ?? [] })));
    const result = await state.service.list(userId, organizationId, { limit: 20 });
    expect(result.items[0]).toEqual(expect.objectContaining({ creditCost: 3, errorMessage: expect.not.stringContaining('signed.example') }));
    expect(result.items[0]?.job.provider).toBe('MOCK');
    expect(result.items[0]?.inputs[0]?.role).toBe('PERSON');
    expect(result.items[0]?.outputs[0]?.asset).not.toHaveProperty('objectKey');
  });

  it('denies outsiders and paginates with the existing cursor contract', async () => {
    const state = harness();
    await state.service.create(userId, organizationId, input);
    state.generations.push({ ...state.generations[0], id: 'generation-two' });
    state.prisma.generation.findMany.mockImplementation((args) => state.generations.slice(0, args?.take).map((generation) => ({ ...generation, aiJob: state.jobs[0], inputs: [], outputs: [] })));
    const first = await state.service.list(userId, organizationId, { limit: 1 });
    expect(first.pageInfo).toEqual({ hasNextPage: true, nextCursor: 'generation-id' });
    await expect(state.service.list('outsider', organizationId, { limit: 20 })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ORGANIZATION_NOT_FOUND' }) });
  });

  it('returns detail associations and hides another organization generation', async () => {
    const state = harness();
    await state.service.create(userId, organizationId, input);
    Object.assign(state.generations[0], { creditCost: 1, inputs: [{ id: 'input-link', role: 'GARMENT', asset: fullAsset('garment') }], outputs: [] });
    const detail = await state.service.get(userId, organizationId, 'generation-id');
    expect(detail.inputs[0]?.role).toBe('GARMENT');
    await expect(state.service.get(userId, organizationId, 'missing')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'GENERATION_NOT_FOUND' }) });
  });
});
