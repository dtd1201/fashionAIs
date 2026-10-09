/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { reconcileRecoverableJobs } from '../src/ai/ai-job-recovery';

describe('AI job startup reconciliation', () => {
  it('releases and requeues stale processing jobs but does not receive fresh ones', async () => {
    const stale = {
      id: 'stale-job',
      generationId: 'generation-id',
      status: 'PROCESSING',
      leaseOwner: 'dead-worker',
      leaseExpiresAt: new Date(Date.now() - 1000),
      updatedAt: new Date(Date.now() - 2000),
      maxAttempts: 3,
    };
    const prisma: any = {
      aIJob: {
        findMany: jest.fn().mockResolvedValue([stale]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      generation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn((operation: (client: unknown) => unknown) =>
        operation(prisma),
      ),
    };
    const queue = { ensureGenerationQueued: jest.fn().mockResolvedValue('queue-id') };
    const config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'ai.jobLeaseMs' ? 60000 : 5000,
      ),
    };

    await expect(
      reconcileRecoverableJobs(prisma as never, queue as never, config as never),
    ).resolves.toBe(1);
    expect(prisma.aIJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    expect(prisma.aIJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: stale.id,
          leaseOwner: stale.leaseOwner,
          leaseExpiresAt: stale.leaseExpiresAt,
        }),
      }),
    );
    expect(queue.ensureGenerationQueued).toHaveBeenCalledTimes(1);
  });

  it('does not requeue a job whose lease changed during reconciliation', async () => {
    const prisma: any = {
      aIJob: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'job-id',
            generationId: 'generation-id',
            status: 'PROCESSING',
            leaseOwner: 'observed-owner',
            leaseExpiresAt: new Date(Date.now() - 1000),
            updatedAt: new Date(Date.now() - 2000),
            maxAttempts: 3,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      generation: { updateMany: jest.fn() },
      $transaction: jest.fn((operation: (client: unknown) => unknown) =>
        operation(prisma),
      ),
    };
    const queue = { ensureGenerationQueued: jest.fn() };
    const config = { getOrThrow: jest.fn().mockReturnValue(60000) };

    await expect(
      reconcileRecoverableJobs(prisma as never, queue as never, config as never),
    ).resolves.toBe(0);
    expect(queue.ensureGenerationQueued).not.toHaveBeenCalled();
  });
});
