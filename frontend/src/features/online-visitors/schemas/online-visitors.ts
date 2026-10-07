import { z } from 'zod';

/** Accept only a real nonnegative integer count; unavailable data never becomes zero. */
export const onlineVisitorsSchema = z.object({
  online: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export type OnlineVisitors = z.infer<typeof onlineVisitorsSchema>;
