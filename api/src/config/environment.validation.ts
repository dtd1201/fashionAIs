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

const PLACEHOLDER_PATTERN = /(change[-_ ]?me|replace[-_ ]?with|development|example|local[-_ ]?smoke)/i;

function hostname(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function isLoopback(value: string): boolean {
  const host = hostname(value) ?? value.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isUnsafeSecret(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value) || new Set(value).size < 8;
}

function isPlaceholderValue(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value) || ['assets', 'bucket', 'your-bucket'].includes(value.toLowerCase());
}

function isHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value;
  } catch {
    return false;
  }
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
  ALLOW_LOCAL_PRODUCTION_SMOKE: Joi.boolean().truthy('true').falsy('false').default(false),
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
  ALLOW_MOCK_AI_IN_PRODUCTION: Joi.boolean().truthy('true').falsy('false').default(false),
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
  AI_JOB_LEASE_MS: Joi.number().integer().min(30000).max(3600000).default(60000),
  AI_JOB_REMOVE_COMPLETE_AGE: Joi.number().integer().min(60).max(2592000).default(86400),
  AI_JOB_REMOVE_FAIL_AGE: Joi.number().integer().min(60).max(7776000).default(604800),
  AI_QUEUE_PREFIX: Joi.string().pattern(/^[A-Za-z0-9:_-]+$/).default('fashionais'),
  MOCK_AI_DELAY_MS: Joi.number().integer().min(0).max(30000).default(100),
  STRIPE_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  STRIPE_SECRET_KEY: Joi.when('STRIPE_ENABLED', { is: true, then: Joi.string().min(1).required(), otherwise: Joi.string().allow('').optional() }),
  STRIPE_WEBHOOK_SECRET: Joi.when('STRIPE_ENABLED', { is: true, then: Joi.string().min(1).required(), otherwise: Joi.string().allow('').optional() }),
  STRIPE_SUCCESS_URL: Joi.when('STRIPE_ENABLED', { is: true, then: Joi.string().uri({ scheme: ['http', 'https'] }).required(), otherwise: Joi.string().uri({ scheme: ['http', 'https'] }).default('http://localhost:3000/billing/success') }),
  STRIPE_CANCEL_URL: Joi.when('STRIPE_ENABLED', { is: true, then: Joi.string().uri({ scheme: ['http', 'https'] }).required(), otherwise: Joi.string().uri({ scheme: ['http', 'https'] }).default('http://localhost:3000/pricing') }),
  STRIPE_PRICE_STARTER: Joi.string().allow('').optional(),
  STRIPE_PRICE_CREATOR: Joi.string().allow('').optional(),
  STRIPE_PRICE_STUDIO: Joi.string().allow('').optional(),
  STRIPE_PRICE_TOPUP_100: Joi.string().allow('').optional(),
  STRIPE_PRICE_TOPUP_500: Joi.string().allow('').optional(),
  STRIPE_PRICE_TOPUP_1000: Joi.string().allow('').optional(),
  STRIPE_PRICE_TOPUP_5000: Joi.string().allow('').optional(),
}).custom((env: Record<string, unknown>, helpers) => {
  if (env.NODE_ENV !== 'production') return env;
  const allowLocalSmoke = env.ALLOW_LOCAL_PRODUCTION_SMOKE === true;
  const invalid = () => helpers.error('any.invalid');
  const text = (key: string) => {
    const value = env[key];
    return typeof value === 'string' || typeof value === 'number'
      ? String(value).trim()
      : '';
  };

  if (!text('REDIS_PASSWORD')) return invalid();
  if (!allowLocalSmoke && [text('JWT_ACCESS_SECRET'), text('JWT_REFRESH_SECRET')].some(isUnsafeSecret)) return invalid();
  if (text('JWT_ACCESS_SECRET') === text('JWT_REFRESH_SECRET')) return invalid();
  if (!allowLocalSmoke) {
    const origins = text('CORS_ORIGINS').split(',').map((origin) => origin.trim()).filter(Boolean);
    if (origins.some((origin) => !isHttpsOrigin(origin) || isLoopback(origin))) return invalid();
    if (isLoopback(text('DATABASE_URL')) || isLoopback(text('REDIS_HOST'))) return invalid();
  }
  if (text('R2_TRANSPORT') === 'worker') {
    const gatewayUrl = text('R2_GATEWAY_BASE_URL');
    if (!gatewayUrl.startsWith('https://') || (!allowLocalSmoke && isLoopback(gatewayUrl))) return invalid();
    if (!text('R2_BUCKET') || (!allowLocalSmoke && isPlaceholderValue(text('R2_BUCKET')))) return invalid();
    if (!allowLocalSmoke && isUnsafeSecret(text('R2_GATEWAY_SIGNING_SECRET'))) return invalid();
  }
  const virtualTryOnProvider = text('AI_VIRTUAL_TRY_ON_PROVIDER') || text('AI_DEFAULT_PROVIDER');
  if (virtualTryOnProvider === 'mock' && env.ALLOW_MOCK_AI_IN_PRODUCTION !== true) return invalid();
  if (env.STRIPE_ENABLED === true) {
    const required = [
      'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_SUCCESS_URL', 'STRIPE_CANCEL_URL',
      'STRIPE_PRICE_STARTER', 'STRIPE_PRICE_CREATOR', 'STRIPE_PRICE_STUDIO',
      'STRIPE_PRICE_TOPUP_100', 'STRIPE_PRICE_TOPUP_500', 'STRIPE_PRICE_TOPUP_1000', 'STRIPE_PRICE_TOPUP_5000',
    ];
    if (required.some((key) => !text(key))) return invalid();
    const secretAndPriceKeys = required.filter((key) => !key.endsWith('_URL'));
    if (secretAndPriceKeys.some((key) => PLACEHOLDER_PATTERN.test(text(key)))) return invalid();
    if (['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'].some((key) => isUnsafeSecret(text(key)))) return invalid();
    if (!text('STRIPE_SUCCESS_URL').startsWith('https://') || !text('STRIPE_CANCEL_URL').startsWith('https://')) return invalid();
  }
  return env;
});
