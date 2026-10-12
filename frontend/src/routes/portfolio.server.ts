import { withIsolatedQueryClient } from '@/app/query-client';
import { currentMonthUTC } from '@/shared/lib/dates';
import { siteQuery } from '@/features/site';
import { experiencesQuery } from '@/features/experiences';
import { projectsQuery } from '@/features/projects';
import { categoriesQuery } from '@/features/skills';
import type { Locale } from '@/i18n/config';
import type { PortfolioSiteSelector } from '@/shared/api/portfolio';
import { dehydrate } from '@tanstack/react-query';
import { portfolioReadError, publicRouteError } from './public-route';

/** Prepare one public portfolio snapshot with an isolated request cache.
 * @param locale Validated public language.
 * @param selector Public handle or query-string Site ID; omitted selectors resolve the published default.
 * @param signal Incoming request cancellation; obsolete page reads release their API work.
 * @returns Site identity and bounded page-one text for the initial HTML document.
 * @throws A public 404 for unavailable sites, or 503 when the API cannot resolve one.
 */
export async function loadPortfolio(
  locale: Locale,
  selector: PortfolioSiteSelector,
  signal?: AbortSignal,
) {
  const origin = process.env.API_SERVER_TARGET ?? process.env.API_BUILD_TARGET;
  if (!origin) throw publicRouteError(503);
  try {
    return await withIsolatedQueryClient(async (client) => {
      // Site resolves the public URL selection; every content read uses the returned ID.
      // Pin identity before section reads so a default switch cannot mix owners.
      // Server requests use public DTOs only; incoming session cookies are never forwarded.
      const site = await client.fetchQuery(siteQuery(locale, origin, selector));
      await Promise.all([
        client.prefetchInfiniteQuery(experiencesQuery(locale, origin, site.site_id)),
        client.prefetchInfiniteQuery(projectsQuery(locale, origin, site.site_id)),
        client.prefetchInfiniteQuery(categoriesQuery(locale, origin, site.site_id)),
      ]);
      return { selector, dehydratedState: dehydrate(client), site, nowMonth: currentMonthUTC() };
    }, signal);
  } catch (error) {
    throw portfolioReadError(error);
  }
}
