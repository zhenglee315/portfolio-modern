import { useQuery } from '@tanstack/react-query';
import type { Locale } from '@/i18n/config';
import { portfolioQuery } from '@/shared/api/portfolio';
import { usePortfolioScope } from '@/shared/context/portfolio';
import { journeySchema } from '../schemas/journey';

/** Fetch the complete ordered index used by tenure, navigation and the interactive map. */
export function journeyQuery(locale: Locale, baseUrl?: string, siteId?: number) {
  return portfolioQuery({ resource: 'journey', siteId }, locale, journeySchema, { baseUrl });
}
/** Subscribe to the full index without recreating a global career store. */
export function useJourney(locale: Locale, enabled = true) {
  const scope = usePortfolioScope(enabled);
  return useQuery({
    ...journeyQuery(locale, undefined, scope.siteId),
    enabled: scope.enabled,
  });
}
