import { useInfiniteQuery } from '@tanstack/react-query';
import type { Locale } from '@/i18n/config';
import { numberedQuery } from '@/shared/api/numbered-query';
import { usePortfolioScope } from '@/shared/context/portfolio';
import { experiencesSchema } from '../schemas/experiences';

/** Specialize the shared continuation policy for ordered experience cards. */
export function experiencesQuery(locale: Locale, baseUrl?: string, siteId?: number) {
  return numberedQuery('experiences', locale, experiencesSchema, { baseUrl, siteId });
}
/** Own server pagination; card disclosure state remains in presentation components. */
export function useExperiences(locale: Locale, enabled = true) {
  const scope = usePortfolioScope(enabled);
  return useInfiniteQuery({
    ...experiencesQuery(locale, undefined, scope.siteId),
    enabled: scope.enabled,
  });
}
