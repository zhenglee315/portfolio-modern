import { useInfiniteQuery } from '@tanstack/react-query';
import type { Locale } from '@/i18n/config';
import { numberedQuery } from '@/shared/api/numbered-query';
import { experiencesSchema } from '../schemas/experiences';

/** Specialize the shared continuation policy for ordered experience cards. */
export function experiencesQuery(locale: Locale, baseUrl?: string) {
  return numberedQuery('experiences', locale, experiencesSchema, { baseUrl });
}
/** Own server pagination; card disclosure state remains in presentation components. */
export function useExperiences(locale: Locale) {
  return useInfiniteQuery(experiencesQuery(locale));
}
