import { getQueryClient } from '@/app/query-client';
import { journeyQuery } from '@/features/journey';
import { currentMonthUTC } from '@/shared/lib/dates';
import { siteQuery } from '@/features/site';
import { experiencesQuery } from '@/features/experiences';
import { projectsQuery } from '@/features/projects';
import { prefetchCategoryIndex } from '@/features/skills';
import type { Locale } from '@/i18n/config';
import { dehydrate } from '@tanstack/react-query';

/** Prepare an isolated locale snapshot using only a server-side public API origin.
 * A Site failure in development leaves the independently usable page shell intact.
 * Static publication requires valid Site content and fails before accepting an artifact.
 */
export async function loadPortfolio(locale: Locale) {
  const client = getQueryClient();
  const origin = process.env.API_BUILD_TARGET;
  if (!origin) throw new Error('A public API build target must be configured.');
  let site;
  try {
    site = await client.fetchQuery(siteQuery(locale, origin));
  } catch {
    if (process.env.PORTFOLIO_PRERENDER === '1')
      throw new Error('Profile content is unavailable for static publication.');
  }
  await Promise.all([
    client.prefetchQuery(journeyQuery(locale, origin)),
    client.prefetchInfiniteQuery(experiencesQuery(locale, origin)),
    client.prefetchInfiniteQuery(projectsQuery(locale, origin)),
    prefetchCategoryIndex(client, locale, origin),
  ]);
  return { dehydratedState: dehydrate(client), site, nowMonth: currentMonthUTC() };
}
