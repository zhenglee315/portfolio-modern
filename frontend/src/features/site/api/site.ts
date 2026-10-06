import { queryOptions, useQuery } from '@tanstack/react-query';
import type { Locale } from '@/i18n/config';
import { requestJson } from '@/shared/api/http';
import { siteSchema } from '../schemas/site';

/** Site is cached by endpoint and URL language; build origins are never query identities. */
export function siteQuery(locale: Locale, baseUrl?: string) {
  return queryOptions({
    queryKey: ['portfolio', locale, 'site'] as const,
    queryFn: ({ signal }) =>
      requestJson(`portfolio/site?${new URLSearchParams({ locale })}`, siteSchema, {
        signal,
        baseUrl,
      }),
  });
}

/** Subscribe to the validated Site DTO without replicating it in component state. */
export function useSite(locale: Locale) {
  return useQuery(siteQuery(locale));
}
