import { environmentSchema } from '../src/config/environment.validation';
import { QueueService } from '../src/queue/queue.service';

const base = {
  NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:pass@db:5432/app', REDIS_HOST: 'redis',
  JWT_ACCESS_SECRET: 'a'.repeat(32), JWT_REFRESH_SECRET: 'b'.repeat(32), CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
  R2_TRANSPORT: 'worker', R2_BUCKET: 'assets', R2_GATEWAY_BASE_URL: 'https://storage.example.workers.dev', R2_GATEWAY_SIGNING_SECRET: 'c'.repeat(32),
  STRIPE_SUCCESS_URL: 'https://app.example.com/billing/success', STRIPE_CANCEL_URL: 'https://app.example.com/pricing',
};

describe('production environment validation', () => {
  it('accepts explicit production origins and worker storage configuration', () => {
    expect(environmentSchema.validate(base).error).toBeUndefined();
  });
  it('rejects wildcard CORS and insecure production return URLs', () => {
    expect(environmentSchema.validate({ ...base, CORS_ORIGINS: '*' }).error).toBeDefined();
    expect(environmentSchema.validate({ ...base, STRIPE_SUCCESS_URL: 'http://app.example.com/success' }).error).toBeDefined();
  });
  it('requires only the selected provider credential', () => {
    expect(environmentSchema.validate({ ...base, AI_VIRTUAL_TRY_ON_PROVIDER: 'fashn' }).error).toBeDefined();
    expect(environmentSchema.validate({ ...base, AI_VIRTUAL_TRY_ON_PROVIDER: 'fashn', FASHN_API_KEY: 'key' }).error).toBeUndefined();
  });
});

it('queue jobs use configured age retention and exponential backoff', async () => {
  const queue = { add: jest.fn().mockResolvedValue({ id: 'job' }), close: jest.fn() };
  const config = { getOrThrow: jest.fn((key: string) => key === 'ai.removeCompleteAge' ? 100 : 200) };
  const service = new QueueService({ quit: jest.fn() } as never, queue as never, queue as never, config as never);
  await service.enqueueGeneration({ generationId: 'generation', aiJobId: 'ai-job' }, { attempts: 3, backoffMs: 5000 });
  expect(queue.add).toHaveBeenCalledWith('generate', expect.anything(), expect.objectContaining({ attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: { age: 100, count: 1000 }, removeOnFail: { age: 200, count: 5000 } }));
});
