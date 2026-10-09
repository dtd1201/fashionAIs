import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  providers: {
    imageGeneration: (process.env.AI_IMAGE_GENERATION_PROVIDER ?? 'mock').toLowerCase(),
    virtualTryOn: (process.env.AI_VIRTUAL_TRY_ON_PROVIDER ?? process.env.AI_DEFAULT_PROVIDER ?? 'mock').toLowerCase(),
    imageEditing: (process.env.AI_IMAGE_EDITING_PROVIDER ?? 'mock').toLowerCase(),
  },
  providerTimeoutMs: Number(process.env.AI_PROVIDER_TIMEOUT_MS ?? 30000),
  maxAttempts: Number(process.env.AI_JOB_MAX_ATTEMPTS ?? 3),
  backoffMs: Number(process.env.AI_JOB_BACKOFF_MS ?? 5000),
  workerConcurrency: Number(process.env.AI_WORKER_CONCURRENCY ?? 2),
  jobLeaseMs: Number(process.env.AI_JOB_LEASE_MS ?? 60000),
  removeCompleteAge: Number(process.env.AI_JOB_REMOVE_COMPLETE_AGE ?? 86400),
  removeFailAge: Number(process.env.AI_JOB_REMOVE_FAIL_AGE ?? 604800),
  queuePrefix: process.env.AI_QUEUE_PREFIX ?? 'fashionais',
  mockDelayMs: Number(process.env.MOCK_AI_DELAY_MS ?? 100),
  fashn: {
    apiKey: process.env.FASHN_API_KEY ?? '',
    baseUrl: (process.env.FASHN_BASE_URL ?? 'https://api.fashn.ai/v1').replace(/\/$/, ''),
    modelName: process.env.FASHN_MODEL_NAME ?? 'tryon-max',
    statusPollIntervalMs: Number(process.env.FASHN_STATUS_POLL_INTERVAL_MS ?? 3000),
    statusTimeoutMs: Number(process.env.FASHN_STATUS_TIMEOUT_MS ?? 120000),
    requestTimeoutMs: Number(process.env.FASHN_REQUEST_TIMEOUT_MS ?? 30000),
    maxOutputBytes: Number(process.env.FASHN_MAX_OUTPUT_BYTES ?? 30 * 1024 * 1024),
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2.5-sunburst',
    quality: process.env.OPENAI_IMAGE_QUALITY ?? 'high',
    size: process.env.OPENAI_IMAGE_SIZE ?? '1024x1536',
    requestTimeoutMs: Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? 120000),
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_IMAGE_MODEL ?? 'gemini-3.1-flash-image',
    requestTimeoutMs: Number(process.env.GEMINI_REQUEST_TIMEOUT_MS ?? 120000),
  },
}));
