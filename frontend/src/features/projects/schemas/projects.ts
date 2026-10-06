import { z } from 'zod';
import {
  numberedPageSchema,
  periodShape,
  recordIdSchema,
  validatePeriod,
} from '@/shared/schemas/records';

/** List payload already includes detail; no additional detail endpoint is needed. */
export const projectDetailSchema = z.object({
  workflowDescription: z.string().nullable(),
  flow: z.array(z.string()).nullable(),
  technicalDescription: z.string().nullable(),
  contribution: z.string().nullable(),
  outcome: z.string().nullable(),
});
export const projectSchema = z
  .object({
    ...periodShape,
    id: recordIdSchema,
    organizationName: z.string(),
    organizationCode: z.string(),
    organizationTitle: z.string(),
    expected: z.boolean().optional(),
    projectName: z.string(),
    projectTitle: z.string(),
    intro: z.string(),
    detail: projectDetailSchema.nullable(),
    skills: z.array(z.string()).nullable(),
  })
  .superRefine(validatePeriod);
export const projectsSchema = numberedPageSchema(projectSchema);
export type Project = z.infer<typeof projectSchema>;
