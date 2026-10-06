import { z } from 'zod';
import { careerShape } from '@/shared/schemas/career';
import { numberedPageSchema, validatePeriod } from '@/shared/schemas/records';

/** Career cards retain complete skill labels and optional expected semantics. */
export const experienceSchema = z
  .object({
    ...careerShape,
    order: z.number(),
    expected: z.boolean().nullish(),
    content: z.string(),
    skills: z.array(z.string()),
  })
  .superRefine(validatePeriod);
export const experiencesSchema = numberedPageSchema(experienceSchema);
export type Experience = z.infer<typeof experienceSchema>;
