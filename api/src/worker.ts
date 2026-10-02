import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { Worker } from 'bullmq';
import redisConfig from './config/redis.config';
import authConfig from './config/auth.config';
import storageConfig from './config/storage.config';
import aiConfig from './config/ai.config';
import { environmentSchema } from './config/environment.validation';
import { AI_GENERATION_QUEUE } from './queue/queue.constants';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './ai/ai.module';
import { CreditsModule } from './credits/credits.module';
import {
  AiGenerationProcessor,
  type AiGenerationJobPayload,
} from './ai/ai-generation.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [authConfig, redisConfig, storageConfig, aiConfig],
      validationSchema: environmentSchema,
    }),
    DatabaseModule,
    AiModule,
    CreditsModule,
  ],
})
class WorkerModule {}

async function bootstrap(): Promise<void> {
  const context = await NestFactory.createApplicationContext(WorkerModule);
  const config = context.get(ConfigService);
  const processor = context.get(AiGenerationProcessor);
  const worker = new Worker<AiGenerationJobPayload>(
    AI_GENERATION_QUEUE,
    (job) =>
      processor.process(
        job.data,
        job.attemptsMade + 1,
      ),
    {
      connection: {
        host: config.getOrThrow<string>('redis.host'),
        port: config.getOrThrow<number>('redis.port'),
        password: config.get<string>('redis.password'),
      },
      prefix: config.getOrThrow<string>('ai.queuePrefix'),
      concurrency: config.getOrThrow<number>('ai.workerConcurrency'),
      maxStalledCount: 2,
      stalledInterval: 30_000,
    },
  );

  worker.on('failed', (job, error) => {
    console.error(JSON.stringify({ operation: 'worker-job-failed', generationId: job?.data.generationId, aiJobId: job?.data.aiJobId, attempt: job?.attemptsMade, error: error.name }));
  });

  const shutdown = async (): Promise<void> => {
    await worker.close();
    await context.close();
    process.exitCode = 0;
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}

void bootstrap();
