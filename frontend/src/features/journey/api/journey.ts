import { queryOptions, useQuery } from '@tanstack/react-query';
import type { Locale } from '@/i18n/config';
import { requestJson } from '@/shared/api/http';
import { journeySchema } from '../schemas/journey';

/** Fetch the complete ordered index used by tenure, navigation and the interactive map. */
export function journeyQuery(locale: Locale, baseUrl?: string) {
  return queryOptions({
    queryKey: ['portfolio', locale, 'journey'] as const,
    queryFn: ({ signal }) =>
      requestJson(`portfolio/journey?${new URLSearchParams({ locale })}`, journeySchema, {
        signal,
        baseUrl,
      }),
  });
}
/** Subscribe to the full index without recreating a global career store. */
export function useJourney(locale: Locale) {
  return useQuery(journeyQuery(locale));
}
