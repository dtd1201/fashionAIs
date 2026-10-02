import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { HealthStatus } from '@fashion-ais/types';
import { PrismaService } from '../database/prisma.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async check(): Promise<HealthStatus> {
    return this.ready();
  }

  live(): { api: 'ok' } {
    return { api: 'ok' };
  }

  async ready(): Promise<HealthStatus> {
    const [database, redis] = await Promise.allSettled([
      this.prisma.isHealthy(),
      this.queue.isRedisHealthy(),
    ]);
    const status: HealthStatus = {
      api: 'ok',
      database: database.status === 'fulfilled' ? 'ok' : 'error',
      redis: redis.status === 'fulfilled' ? 'ok' : 'error',
    };

    if (status.database === 'error' || status.redis === 'error') {
      throw new ServiceUnavailableException({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'One or more required services are unavailable',
        details: status,
      });
    }

    return status;
  }
}
