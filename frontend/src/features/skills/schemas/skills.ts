import { z } from 'zod';
import { numberedPageSchema, stableIdSchema } from '@/shared/schemas/records';

export const skillSchema = z.object({ id: stableIdSchema, label: z.string() });
export const skillsSchema = numberedPageSchema(skillSchema);
/** Category previews own the first skill page; continuation starts at page two. */
export const categorySchema = z
  .object({ id: stableIdSchema, label: z.string(), skills: skillsSchema })
  .superRefine((value, context) => {
    if (value.skills.page !== 1)
      context.addIssue({ code: 'custom', message: 'Preview must be page one.' });
  });
export const categoriesSchema = numberedPageSchema(categorySchema);
export type Skill = z.infer<typeof skillSchema>;
export type SkillCategory = z.infer<typeof categorySchema>;
