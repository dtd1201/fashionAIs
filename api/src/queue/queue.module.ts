import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import {
  EXAMPLE_QUEUE,
  EXAMPLE_QUEUE_CLIENT,
  AI_GENERATION_QUEUE,
  AI_GENERATION_QUEUE_CLIENT,
  REDIS_CLIENT,
} from './queue.constants';
import { QueueService } from './queue.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.getOrThrow<string>('redis.host'),
          port: config.getOrThrow<number>('redis.port'),
        password: config.get<string>('redis.password'),
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        }),
    },
    {
      provide: AI_GENERATION_QUEUE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Queue(AI_GENERATION_QUEUE, {
        connection: {
            host: config.getOrThrow<string>('redis.host'),
            port: config.getOrThrow<number>('redis.port'),
            password: config.get<string>('redis.password'),
        },
        prefix: config.getOrThrow<string>('ai.queuePrefix'),
        }),
    },
    {
      provide: EXAMPLE_QUEUE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Queue(EXAMPLE_QUEUE, {
        connection: {
            host: config.getOrThrow<string>('redis.host'),
            port: config.getOrThrow<number>('redis.port'),
            password: config.get<string>('redis.password'),
        },
        prefix: config.getOrThrow<string>('ai.queuePrefix'),
        }),
    },
    QueueService,
  ],
  exports: [
    QueueService,
    REDIS_CLIENT,
    EXAMPLE_QUEUE_CLIENT,
    AI_GENERATION_QUEUE_CLIENT,
  ],
})
export class QueueModule {}
