import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
}));

function parseTrustProxy(value: string | undefined): false | number | string {
  const normalized = value?.trim();
  if (!normalized || normalized === 'false') return false;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return normalized;
}
