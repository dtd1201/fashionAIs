import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import {
  AI_GENERATION_QUEUE_CLIENT,
  EXAMPLE_QUEUE_CLIENT,
  REDIS_CLIENT,
} from './queue.constants';

@Injectable()
export class QueueService implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(EXAMPLE_QUEUE_CLIENT) private readonly queue: Queue,
    @Inject(AI_GENERATION_QUEUE_CLIENT) private readonly aiQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  async isRedisHealthy(): Promise<boolean> {
    return (await this.redis.ping()) === 'PONG';
  }

  async enqueueGeneration(
    payload: { generationId: string; aiJobId: string },
    options: { attempts: number; backoffMs: number },
  ): Promise<string> {
    const queueJobId = `ai-job-${payload.aiJobId}`;
    await this.aiQueue.add('generate', payload, {
      jobId: queueJobId,
      attempts: options.attempts,
      backoff: { type: 'exponential', delay: options.backoffMs },
      removeOnComplete: { age: this.config.getOrThrow<number>('ai.removeCompleteAge'), count: 1000 },
      removeOnFail: { age: this.config.getOrThrow<number>('ai.removeFailAge'), count: 5000 },
    });
    return queueJobId;
  }

  async ensureGenerationQueued(
    payload: { generationId: string; aiJobId: string },
    options: { attempts: number; backoffMs: number },
  ): Promise<string> {
    const queueJobId = `ai-job-${payload.aiJobId}`;
    const existing = await this.aiQueue.getJob(queueJobId);
    if (existing) {
      const state = await existing.getState();
      if (!['completed', 'failed'].includes(state)) return queueJobId;
      await existing.remove();
    }
    return this.enqueueGeneration(payload, options);
  }

  async addHealthJob(): Promise<string> {
    const job = await this.queue.add(
      'health',
      { checkedAt: new Date().toISOString() },
      { removeOnComplete: 10 },
    );
    return String(job.id);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([
      this.queue.close(),
      this.aiQueue.close(),
      this.redis.quit(),
    ]);
  }
}
