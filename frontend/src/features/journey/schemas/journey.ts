import { z } from 'zod';
import { uniqueRecords, validatePeriod } from '@/shared/schemas/records';
import { careerShape } from '@/shared/schemas/career';

/** Full ordered map index; coordinate and period validation precedes rendering. */
export const journeyItemSchema = z
  .object({
    ...careerShape,
    expected: z.boolean(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .superRefine(validatePeriod);
export const journeySchema = z.array(journeyItemSchema).superRefine(uniqueRecords);
export type JourneyStop = z.infer<typeof journeyItemSchema>;
