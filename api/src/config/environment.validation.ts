import Joi from 'joi';

function selectedProviderCredential(provider: string): Joi.Schema {
  const optional = Joi.string().allow('').optional();
  return Joi.when('AI_VIRTUAL_TRY_ON_PROVIDER', {
    is: provider,
    then: Joi.string().min(1).required(),
    otherwise: Joi.when('AI_VIRTUAL_TRY_ON_PROVIDER', {
      is: Joi.string().required(),
      then: optional,
      otherwise: Joi.when('AI_DEFAULT_PROVIDER', {
        is: provider,
        then: Joi.string().min(1).required(),
        otherwise: optional,
      }),
    }),
  });
}

export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3001),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  REDIS_HOST: Joi.string().hostname().required(),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string()
    .min(32)
    .required()
    .invalid(Joi.ref('JWT_ACCESS_SECRET')),
  JWT_ACCESS_EXPIRES_IN: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('30d'),
  CORS_ORIGINS: Joi.string().required().custom((value: string, helpers) => {
    const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
    if (origins.length === 0 || origins.includes('*')) return helpers.error('any.invalid');
    return value;
  }, 'explicit CORS origin allowlist'),
  TRUST_PROXY: Joi.string().allow('').default(''),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info'),
  R2_TRANSPORT: Joi.string().valid('s3', 'worker').default('s3'),
  R2_ACCOUNT_ID: Joi.when('R2_TRANSPORT', {
    is: 's3',
    then: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().required(),
      otherwise: Joi.string().allow('').optional(),
    }),
    otherwise: Joi.string().allow('').optional(),
  }),
  R2_ENDPOINT: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .optional(),
  R2_ACCESS_KEY_ID: Joi.when('R2_TRANSPORT', {
    is: 's3',
    then: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().required(),
      otherwise: Joi.string().allow('').optional(),
    }),
    otherwise: Joi.string().allow('').optional(),
  }),
  R2_SECRET_ACCESS_KEY: Joi.when('R2_TRANSPORT', {
    is: 's3',
    then: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().required(),
      otherwise: Joi.string().allow('').optional(),
    }),
    otherwise: Joi.string().allow('').optional(),
  }),
  R2_BUCKET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  R2_PUBLIC_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .optional(),
  R2_GATEWAY_BASE_URL: Joi.when('R2_TRANSPORT', {
    is: 'worker',
    then: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().uri({ scheme: ['https'] }).required(),
      otherwise: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .required(),
    }),
    otherwise: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .allow('')
      .optional(),
  }),
  R2_GATEWAY_SIGNING_SECRET: Joi.when('R2_TRANSPORT', {
    is: 'worker',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  R2_UPLOAD_EXPIRES_IN_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(3600)
    .default(900),
  R2_DOWNLOAD_EXPIRES_IN_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(3600)
    .default(600),
  ASSET_MAX_IMAGE_BYTES: Joi.number()
    .integer()
    .positive()
    .default(20 * 1024 * 1024),
  ASSET_MAX_VIDEO_BYTES: Joi.number()
    .integer()
    .positive()
    .default(200 * 1024 * 1024),
  ASSET_MAX_PDF_BYTES: Joi.number()
    .integer()
    .positive()
    .default(25 * 1024 * 1024),
  AI_DEFAULT_PROVIDER: Joi.string()
    .valid('mock', 'fashn', 'openai', 'gemini')
    .default('mock'),
  AI_IMAGE_GENERATION_PROVIDER: Joi.string().valid('mock').optional(),
  AI_VIRTUAL_TRY_ON_PROVIDER: Joi.string()
    .valid('mock', 'fashn', 'openai', 'gemini')
    .optional(),
  AI_IMAGE_EDITING_PROVIDER: Joi.string().valid('mock').optional(),
  AI_PROVIDER_TIMEOUT_MS: Joi.number().integer().min(100).max(600000).default(30000),
  FASHN_API_KEY: selectedProviderCredential('fashn'),
  FASHN_BASE_URL: Joi.string().uri({ scheme: ['https'] }).default('https://api.fashn.ai/v1'),
  FASHN_MODEL_NAME: Joi.string().valid('tryon-max').default('tryon-max'),
  FASHN_STATUS_POLL_INTERVAL_MS: Joi.number().integer().min(1000).max(60000).default(3000),
  FASHN_STATUS_TIMEOUT_MS: Joi.number().integer().min(1000).max(900000).default(120000),
  FASHN_REQUEST_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(30000),
  FASHN_MAX_OUTPUT_BYTES: Joi.number().integer().min(1024).max(100 * 1024 * 1024).default(30 * 1024 * 1024),
  OPENAI_API_KEY: selectedProviderCredential('openai'),
  OPENAI_IMAGE_MODEL: Joi.string().default('gpt-image-2.5-sunburst'),
  OPENAI_IMAGE_QUALITY: Joi.string()
    .valid('low', 'medium', 'high', 'xhigh', 'max')
    .default('high'),
  OPENAI_IMAGE_SIZE: Joi.string().default('1024x1536'),
  OPENAI_REQUEST_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(600000)
    .default(120000),
  GEMINI_API_KEY: selectedProviderCredential('gemini'),
  GEMINI_IMAGE_MODEL: Joi.string().default('gemini-3.1-flash-image'),
  GEMINI_REQUEST_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(600000)
    .default(120000),
  AI_JOB_MAX_ATTEMPTS: Joi.number().integer().min(1).max(10).default(3),
  AI_JOB_BACKOFF_MS: Joi.number().integer().min(100).max(300000).default(5000),
  AI_WORKER_CONCURRENCY: Joi.number().integer().min(1).max(50).default(2),
  AI_JOB_REMOVE_COMPLETE_AGE: Joi.number().integer().min(60).max(2592000).default(86400),
  AI_JOB_REMOVE_FAIL_AGE: Joi.number().integer().min(60).max(7776000).default(604800),
  AI_QUEUE_PREFIX: Joi.string().pattern(/^[A-Za-z0-9:_-]+$/).default('fashionais'),
  MOCK_AI_DELAY_MS: Joi.number().integer().min(0).max(30000).default(100),
  STRIPE_SECRET_KEY: Joi.string().allow('').optional(),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('').optional(),
  STRIPE_SUCCESS_URL: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().uri({ scheme: ['https'] }).required(), otherwise: Joi.string().uri({ scheme: ['http', 'https'] }).default('http://localhost:3000/billing/success') }),
  STRIPE_CANCEL_URL: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().uri({ scheme: ['https'] }).required(), otherwise: Joi.string().uri({ scheme: ['http', 'https'] }).default('http://localhost:3000/pricing') }),
  STRIPE_PRICE_STARTER: Joi.string().allow('').optional(),
  STRIPE_PRICE_CREATOR: Joi.string().allow('').optional(),
  STRIPE_PRICE_STUDIO: Joi.string().allow('').optional(),
  STRIPE_PRICE_TOPUP_100: Joi.string().allow('').optional(),
  STRIPE_PRICE_TOPUP_500: Joi.string().allow('').optional(),
  STRIPE_PRICE_TOPUP_1000: Joi.string().allow('').optional(),
  STRIPE_PRICE_TOPUP_5000: Joi.string().allow('').optional(),
});
