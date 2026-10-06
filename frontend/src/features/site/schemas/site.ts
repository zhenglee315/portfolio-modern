import { z } from 'zod';
import { textSchema as text } from '@/shared/schemas/records';

/** Public Site DTO. Empty optional display copy remains a valid string. */
export const siteSchema = z.object({
  brand: z.object({
    title: text,
    titleSub: text,
    copyrightYear: z.number().int().min(1900).max(9999),
  }),
  profile: z.object({
    firstName: text,
    familyName: text,
    nickName: text,
    content: text,
    eduCode: text,
    program: text,
    introContent: text,
    footerContent: text,
  }),
  social: z.object({ linkedin: text, github: text, medium: text, email: text }),
  chatme: z.object({ title: text, titleSub: text, content: text, icon: text }),
});
export type Site = z.infer<typeof siteSchema>;
