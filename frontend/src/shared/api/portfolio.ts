import { queryOptions, type QueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { requestJson } from './http';

/** Select Site metadata by public user or ID; content reads accept only the resolved ID. */
export type PortfolioSiteSelector =
  { user?: string; site_id?: never } | { user?: never; site_id?: number };

export type PortfolioAccess = 'public' | 'preview';

/** Select protected transport without changing public portfolio reads. */
export function portfolioTransport(access: PortfolioAccess = 'public') {
  return access === 'preview'
    ? {
        prefix: 'management/portfolio',
        credentials: 'include' as const,
        cache: 'no-store' as const,
      }
    : { prefix: 'portfolio' };
}

/** Keep selector lookups separate from pinned site content in every query cache. */
export function portfolioIdentity(selector: PortfolioSiteSelector = {}) {
  if (selector.site_id !== undefined) return `site:${selector.site_id}`;
  return selector.user !== undefined ? `user:${selector.user}` : 'default';
}

/** Share the public identity and language prefix across domain queries and cancellation. */
export function portfolioKey(
  locale: string,
  selector: PortfolioSiteSelector = {},
  access: PortfolioAccess = 'public',
) {
  return [
    access === 'preview' ? 'portfolio-preview' : 'portfolio',
    portfolioIdentity(selector),
    locale,
  ] as const;
}

/** Pin content requests to a Site; an omitted ID retains the legacy public default.
 * @param locale Public language requested by the owning feature.
 * @param siteId Resolved public Site ID; user lookups belong exclusively to the Site query.
 * @returns Common content parameters extended by the owning domain or pagination helper.
 */
export function portfolioContentParams(locale: string, siteId?: number) {
  const params = new URLSearchParams({ locale });
  if (siteId !== undefined) params.set('site_id', String(siteId));
  return params;
}
/** Share single-response transport while limiting public user lookup to Site metadata.
 * @param request Site selector or resolved Journey scope; content cannot accept a user selector.
 * @param locale Public language included in the request and cache identity.
 * @param schema Domain response contract, checked before data enters the query cache.
 * @param options Server-only origin and optional domain consistency check.
 * @returns Query options with validated data, scoped identity and request cancellation.
 */
export function portfolioQuery<T>(
  request:
    | { resource: 'site'; selector?: PortfolioSiteSelector; siteId?: never }
    | { resource: 'journey'; siteId?: number; selector?: never },
  locale: string,
  schema: z.ZodType<T>,
  options: {
    baseUrl?: string;
    validate?: (value: T) => void;
    access?: PortfolioAccess;
  } = {},
) {
  const selector = request.resource === 'site' ? request.selector : { site_id: request.siteId };
  const transport = portfolioTransport(options.access);
  return queryOptions({
    queryKey: [...portfolioKey(locale, selector, options.access), request.resource] as const,
    meta: options.access === 'preview' ? { private: true } : undefined,
    queryFn: async ({ signal }) => {
      const params = portfolioContentParams(locale, selector?.site_id);
      if (request.resource === 'site' && request.selector?.user !== undefined)
        params.set('user', request.selector.user);
      const value = await requestJson(`${transport.prefix}/${request.resource}?${params}`, schema, {
        signal,
        baseUrl: options.baseUrl,
        credentials: transport.credentials,
        cache: transport.cache,
      });
      options.validate?.(value);
      return value;
    },
  });
}

/** Cancel one public lookup and its resolved content without touching another owner or account.
 * @param client Browser cache owning the requests to cancel.
 * @param locale Language being replaced or released.
 * @param selector Site lookup identity; an omitted selector means the public default.
 * @param siteId Resolved content identity; unresolved lookups never cancel default content.
 */
export async function cancelPortfolioQueries(
  client: QueryClient,
  locale: string,
  selector: PortfolioSiteSelector = {},
  siteId?: number,
  access: PortfolioAccess = 'public',
) {
  const keys = [portfolioKey(locale, selector, access)];
  if (siteId !== undefined) {
    const content = portfolioKey(locale, { site_id: siteId }, access);
    if (content[1] !== keys[0]![1]) keys.push(content);
  }
  await Promise.all(keys.map((queryKey) => client.cancelQueries({ queryKey })));
}
