import { z } from 'zod';
import { periodShape, recordIdSchema, validatePeriod } from './records';

/** Common career fields returned by both Journey and Experiences endpoints. */
export const careerDetailSchema = z
  .object({ ...periodShape, content: z.string() })
  .superRefine(validatePeriod);
export const careerShape = {
  ...periodShape,
  id: recordIdSchema,
  type: z.enum(['work', 'education']),
  countryCode: z.string().regex(/^[A-Z]{3}$/),
  countryName: z.string(),
  city: z.string(),
  organizationName: z.string(),
  organizationCode: z.string(),
  organizationTitle: z.string(),
  detail: careerDetailSchema.nullable(),
};
