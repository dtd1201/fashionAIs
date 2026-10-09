import { environmentSchema } from '../src/config/environment.validation';
import { QueueService } from '../src/queue/queue.service';

const base = {
  NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:pass@db:5432/app', REDIS_HOST: 'redis',
  REDIS_PASSWORD: 'strong-redis-password',
  JWT_ACCESS_SECRET: 'A7x!access-secret-9Qv2-production', JWT_REFRESH_SECRET: 'B8y!refresh-secret-4Wm6-production', CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
  R2_TRANSPORT: 'worker', R2_BUCKET: 'fashionais-assets', R2_GATEWAY_BASE_URL: 'https://storage.example.workers.dev', R2_GATEWAY_SIGNING_SECRET: 'C9z!gateway-secret-7Rn3-production',
  ALLOW_MOCK_AI_IN_PRODUCTION: true,
};

describe('production environment validation', () => {
  it('accepts explicit production origins and worker storage configuration', () => {
    expect(environmentSchema.validate(base).error).toBeUndefined();
  });
  it('rejects wildcard, local, and insecure production origins', () => {
    expect(environmentSchema.validate({ ...base, CORS_ORIGINS: '*' }).error).toBeDefined();
    expect(environmentSchema.validate({ ...base, CORS_ORIGINS: 'https://localhost:3000' }).error).toBeDefined();
    expect(environmentSchema.validate({ ...base, CORS_ORIGINS: 'http://app.example.com' }).error).toBeDefined();
  });
  it('requires only the selected provider credential', () => {
    expect(environmentSchema.validate({ ...base, AI_VIRTUAL_TRY_ON_PROVIDER: 'fashn' }).error).toBeDefined();
    expect(environmentSchema.validate({ ...base, AI_VIRTUAL_TRY_ON_PROVIDER: 'fashn', FASHN_API_KEY: 'key' }).error).toBeUndefined();
  });

  it('rejects empty Redis passwords, loopback dependencies, and placeholder secrets', () => {
    expect(environmentSchema.validate({ ...base, REDIS_PASSWORD: '' }).error).toBeDefined();
    expect(environmentSchema.validate({ ...base, DATABASE_URL: 'postgresql://user:pass@localhost:5432/app' }).error).toBeDefined();
    expect(environmentSchema.validate({ ...base, REDIS_HOST: '127.0.0.1' }).error).toBeDefined();
    expect(environmentSchema.validate({ ...base, R2_GATEWAY_BASE_URL: 'https://localhost:8787' }).error).toBeDefined();
    expect(environmentSchema.validate({ ...base, R2_BUCKET: 'your-bucket' }).error).toBeDefined();
    expect(environmentSchema.validate({ ...base, JWT_ACCESS_SECRET: 'replace-with-a-development-secret-123' }).error).toBeDefined();
    expect(environmentSchema.validate({ ...base, R2_GATEWAY_SIGNING_SECRET: 'replace-with-example-signing-secret' }).error).toBeDefined();
  });

  it('allows local production-style smoke only with the explicit override', () => {
    expect(environmentSchema.validate({
      ...base,
      ALLOW_LOCAL_PRODUCTION_SMOKE: true,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
      REDIS_HOST: '127.0.0.1',
      CORS_ORIGINS: 'https://localhost:8443',
      R2_GATEWAY_BASE_URL: 'https://localhost:8787',
      R2_BUCKET: 'your-bucket',
      JWT_ACCESS_SECRET: 'local-smoke-access-secret-change-me',
      R2_GATEWAY_SIGNING_SECRET: 'local-smoke-gateway-secret-change-me',
    }).error).toBeUndefined();
  });

  it('requires an explicit override for mock virtual try-on', () => {
    expect(environmentSchema.validate({ ...base, ALLOW_MOCK_AI_IN_PRODUCTION: false }).error).toBeDefined();
  });

  it('keeps Stripe disabled atomically and rejects partial enabled configuration', () => {
    expect(environmentSchema.validate({ ...base, STRIPE_ENABLED: false }).error).toBeUndefined();
    expect(environmentSchema.validate({ ...base, STRIPE_ENABLED: true, STRIPE_SECRET_KEY: 'sk_live_value' }).error).toBeDefined();
  });

  it('accepts only complete Stripe configuration with HTTPS return URLs', () => {
    const stripe = {
      STRIPE_ENABLED: true,
      STRIPE_SECRET_KEY: 'sk_live_51StrongProdValue9X',
      STRIPE_WEBHOOK_SECRET: 'whsec_StrongWebhookValue7Y',
      STRIPE_SUCCESS_URL: 'https://app.example.com/billing/success',
      STRIPE_CANCEL_URL: 'https://app.example.com/pricing',
      STRIPE_PRICE_STARTER: 'price_starter', STRIPE_PRICE_CREATOR: 'price_creator', STRIPE_PRICE_STUDIO: 'price_studio',
      STRIPE_PRICE_TOPUP_100: 'price_100', STRIPE_PRICE_TOPUP_500: 'price_500', STRIPE_PRICE_TOPUP_1000: 'price_1000', STRIPE_PRICE_TOPUP_5000: 'price_5000',
    };
    expect(environmentSchema.validate({ ...base, ...stripe }).error).toBeUndefined();
    expect(environmentSchema.validate({ ...base, ...stripe, STRIPE_SUCCESS_URL: 'http://app.example.com/success' }).error).toBeDefined();
  });
});

it('queue jobs use configured age retention and exponential backoff', async () => {
  const queue = { add: jest.fn().mockResolvedValue({ id: 'job' }), close: jest.fn() };
  const config = { getOrThrow: jest.fn((key: string) => key === 'ai.removeCompleteAge' ? 100 : 200) };
  const service = new QueueService({ quit: jest.fn() } as never, queue as never, queue as never, config as never);
  await service.enqueueGeneration({ generationId: 'generation', aiJobId: 'ai-job' }, { attempts: 3, backoffMs: 5000 });
  expect(queue.add).toHaveBeenCalledWith('generate', expect.anything(), expect.objectContaining({ attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: { age: 100, count: 1000 }, removeOnFail: { age: 200, count: 5000 } }));
});
