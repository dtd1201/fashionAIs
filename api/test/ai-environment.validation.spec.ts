import { environmentSchema } from '../src/config/environment.validation';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
  REDIS_HOST: 'localhost',
  JWT_ACCESS_SECRET: 'access-secret-with-at-least-32-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-with-at-least-32-characters',
  CORS_ORIGINS: 'http://localhost:3000',
};

describe('AI provider environment validation', () => {
  it.each([
    ['fashn', 'FASHN_API_KEY'],
    ['openai', 'OPENAI_API_KEY'],
    ['gemini', 'GEMINI_API_KEY'],
  ] as const)('requires only the selected %s credential', (provider, key) => {
    const selected = environmentSchema.validate({
      ...base,
      AI_VIRTUAL_TRY_ON_PROVIDER: provider,
      [key]: 'selected-provider-key',
    });
    const missing = environmentSchema.validate({
      ...base,
      AI_VIRTUAL_TRY_ON_PROVIDER: provider,
    });

    expect(selected.error).toBeUndefined();
    expect(missing.error?.message).toContain(key);
  });

  it('rejects an unknown virtual try-on provider', () => {
    const result = environmentSchema.validate({
      ...base,
      AI_VIRTUAL_TRY_ON_PROVIDER: 'unknown',
    });
    expect(result.error?.message).toContain('AI_VIRTUAL_TRY_ON_PROVIDER');
  });

  it('does not require the default provider credential when virtual try-on explicitly selects another provider', () => {
    const result = environmentSchema.validate({
      ...base,
      AI_DEFAULT_PROVIDER: 'fashn',
      AI_VIRTUAL_TRY_ON_PROVIDER: 'openai',
      OPENAI_API_KEY: 'selected-provider-key',
    });
    expect(result.error).toBeUndefined();
  });
});
