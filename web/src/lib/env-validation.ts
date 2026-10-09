import { z } from 'zod';

const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
});

export function validatePublicEnv(input: {
  NEXT_PUBLIC_API_URL?: string;
  NODE_ENV?: string;
}) {
  const parsed = publicEnvSchema.parse({
    NEXT_PUBLIC_API_URL: input.NEXT_PUBLIC_API_URL,
  });
  if (
    input.NODE_ENV === 'production' &&
    !parsed.NEXT_PUBLIC_API_URL.startsWith('https://')
  ) {
    throw new Error('NEXT_PUBLIC_API_URL must use HTTPS in production');
  }
  return parsed;
}
