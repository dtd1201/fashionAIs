import { z } from 'zod';

export const cursorPaginationSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CursorPagination = z.infer<typeof cursorPaginationSchema>;
