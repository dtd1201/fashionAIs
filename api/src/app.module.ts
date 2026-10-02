import {
  MiddlewareConsumer,
  Module,
  RequestMethod,
  type NestModule,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import redisConfig from './config/redis.config';
import storageConfig from './config/storage.config';
import aiConfig from './config/ai.config';
import billingConfig from './config/billing.config';
import { environmentSchema } from './config/environment.validation';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { QueueModule } from './queue/queue.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { AssetsModule } from './assets/assets.module';
import { GenerationsModule } from './generations/generations.module';
import { CreditsModule } from './credits/credits.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, authConfig, redisConfig, storageConfig, aiConfig, billingConfig],
      validationSchema: environmentSchema,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    QueueModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    AssetsModule,
    GenerationsModule,
    CreditsModule,
    BillingModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, RequestLoggerMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
