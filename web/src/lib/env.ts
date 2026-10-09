import { validatePublicEnv } from './env-validation';

export { validatePublicEnv } from './env-validation';

export const env = validatePublicEnv({ NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL, NODE_ENV: process.env.NODE_ENV });
