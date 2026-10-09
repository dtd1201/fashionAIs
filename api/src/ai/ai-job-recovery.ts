import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma.service';
import type { QueueService } from '../queue/queue.service';

export async function reconcileRecoverableJobs(
  prisma: PrismaService,
  queue: QueueService,
  config: ConfigService,
): Promise<number> {
  const now = new Date();
  const staleBefore = new Date(
    now.getTime() - config.getOrThrow<number>('ai.jobLeaseMs'),
  );
  const jobs = await prisma.aIJob.findMany({
    where: {
      OR: [
        { status: 'QUEUED' },
        { status: 'PROCESSING', leaseExpiresAt: { lte: now } },
        {
          status: 'PROCESSING',
          leaseExpiresAt: null,
          updatedAt: { lte: staleBefore },
        },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take: 100,
    select: {
      id: true,
      generationId: true,
      status: true,
      leaseOwner: true,
      leaseExpiresAt: true,
      updatedAt: true,
      maxAttempts: true,
    },
  });

  let recovered = 0;
  for (const job of jobs) {
    if (job.status === 'PROCESSING') {
      const released = await prisma.$transaction(async (transaction) => {
        const result = await transaction.aIJob.updateMany({
          where: {
            id: job.id,
            status: 'PROCESSING',
            leaseOwner: job.leaseOwner,
            leaseExpiresAt: job.leaseExpiresAt,
            updatedAt: job.updatedAt,
          },
          data: {
            status: 'QUEUED',
            leaseOwner: null,
            leaseExpiresAt: null,
            errorCode: 'AI_JOB_RECOVERED',
            errorMessage: 'Generation recovered after worker interruption',
          },
        });
        if (result.count !== 1) return false;
        await transaction.generation.updateMany({
          where: { id: job.generationId, status: 'PROCESSING' },
          data: {
            status: 'QUEUED',
            errorCode: 'AI_JOB_RECOVERED',
            errorMessage: 'Generation recovered after worker interruption',
          },
        });
        return true;
      });
      if (!released) continue;
      recovered += 1;
    }
    await queue.ensureGenerationQueued(
      { generationId: job.generationId, aiJobId: job.id },
      {
        attempts: job.maxAttempts,
        backoffMs: config.getOrThrow<number>('ai.backoffMs'),
      },
    );
  }
  return recovered;
}
