import { dehydrate, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { withIsolatedQueryClient } from '@/app/query-client';
import { siteQuery } from '@/features/site';
import { journeyQuery } from '@/features/journey';
import { experiencesQuery, type Experience } from '@/features/experiences';
import { projectsQuery, type Project } from '@/features/projects';
import {
  categoriesQuery,
  skillsQuery,
  categorySkillLabels,
  type Skill,
  type SkillCategory,
} from '@/features/skills';
import type { Locale } from '@/i18n/config';
import { ApiError } from '@/shared/api/http';
import { portfolioKey, type PortfolioSiteSelector } from '@/shared/api/portfolio';
import { fillNumberedPages, pageRecords, type numberedQuery } from '@/shared/api/numbered-query';
import type { NumberedPage } from '@/shared/schemas/records';

type Pages<T> = InfiniteData<NumberedPage<T>>;
export type LocaleScope = {
  site: boolean;
  selector: PortfolioSiteSelector;
  siteId?: number;
  journey?: { id: number }[];
  experiences?: Pages<Experience>;
  projects?: Pages<Project>;
  categories?: Pages<SkillCategory>;
  owners: { id: string; data: Pages<Skill> }[];
};

/** Capture loaded ranges from one Site, including closed-but-cached collection pages.
 * @param client Browser cache holding validated source-language responses.
 * @param locale Currently visible language.
 * @param selector Site lookup identity; an unresolved named Site cannot capture default content.
 * @param siteId Resolved content identity; inferred from cached Site metadata when available.
 * @returns Isolated source ranges for preparing the same Site in another language.
 */
export function captureLocaleScope(
  client: QueryClient,
  locale: Locale,
  selector: PortfolioSiteSelector = {},
  siteId?: number,
): LocaleScope {
  const site = client.getQueryData(siteQuery(locale, undefined, selector).queryKey);
  siteId ??= site?.site_id ?? selector.site_id;
  const scope: LocaleScope = { site: !!site, selector, siteId, owners: [] };
  if (siteId === undefined && selector.user !== undefined) return scope;
  return {
    ...scope,
    journey: client.getQueryData(journeyQuery(locale, undefined, siteId).queryKey),
    experiences: client.getQueryData(experiencesQuery(locale, undefined, siteId).queryKey),
    projects: client.getQueryData(projectsQuery(locale, undefined, siteId).queryKey),
    categories: client.getQueryData(categoriesQuery(locale, undefined, siteId).queryKey),
    owners: client
      .getQueriesData<Pages<Skill>>({
        queryKey: [...portfolioKey(locale, { site_id: siteId }), 'skills'],
      })
      .flatMap(([key, data]) => (typeof key[4] === 'string' && data ? [{ id: key[4], data }] : [])),
  };
}

/** Refuse a locale commit if the source identities or ordering changed during reads. */
function sameIds(source: { id: string | number }[], target: { id: string | number }[]) {
  if (
    source.length !== target.length ||
    source.some((item, index) => item.id !== target[index]?.id)
  )
    throw new ApiError('contract');
}

/** Prepare exactly the previously loaded page range in an isolated transaction cache. */
async function preparePages<T extends { id: string | number }>(
  client: QueryClient,
  options: ReturnType<typeof numberedQuery<T>>,
  source: Pages<T>,
  seed?: NumberedPage<T>,
) {
  if (seed) client.setQueryData(options.queryKey, { pages: [seed], pageParams: [1] });
  else await client.fetchInfiniteQuery(options);
  const initial = client.getQueryData<Pages<T>>(options.queryKey);
  if (initial?.pages[0]?.total !== source.pages[0]?.total) throw new ApiError('contract');
  const result = await fillNumberedPages(client, options, source.pages.length);
  sameIds(pageRecords(source), pageRecords(result));
}

/** Fetch a target locale atomically while leaving the visible cache and URL intact.
 * Category previews seed owner page one; all previously loaded owner ranges continue.
 * Caller cancellation destroys all staging requests and cannot commit partial translations.
 */
export async function prepareLocale(scope: LocaleScope, locale: Locale, signal: AbortSignal) {
  return withIsolatedQueryClient(async (client) => {
    const tasks: Promise<unknown>[] = [];
    if (scope.site)
      tasks.push(
        client.fetchQuery(siteQuery(locale, undefined, scope.selector)).then((site) => {
          if (scope.siteId !== undefined && site.site_id !== scope.siteId)
            throw new ApiError('contract');
        }),
      );
    if (scope.journey)
      tasks.push(
        client
          .fetchQuery(journeyQuery(locale, undefined, scope.siteId))
          .then((result) => sameIds(scope.journey ?? [], result)),
      );
    if (scope.experiences)
      tasks.push(
        preparePages(client, experiencesQuery(locale, undefined, scope.siteId), scope.experiences),
      );
    if (scope.projects)
      tasks.push(
        preparePages(client, projectsQuery(locale, undefined, scope.siteId), scope.projects),
      );
    if (scope.categories)
      tasks.push(
        preparePages(
          client,
          categoriesQuery(locale, undefined, scope.siteId),
          scope.categories,
        ).then(async () => {
          const categories = pageRecords(
            client.getQueryData(categoriesQuery(locale, undefined, scope.siteId).queryKey),
          );
          categorySkillLabels(categories);
          const owners = await Promise.allSettled(
            scope.owners.map((owner) => {
              const category = categories.find((item) => item.id === owner.id);
              if (!category) throw new ApiError('contract');
              return preparePages(
                client,
                skillsQuery(locale, owner.id, undefined, scope.siteId),
                owner.data,
                category.skills,
              );
            }),
          );
          if (owners.some((result) => result.status === 'rejected')) throw new ApiError('contract');
        }),
      );
    const results = await Promise.allSettled(tasks);
    if (results.some((result) => result.status === 'rejected')) throw new ApiError('contract');
    return dehydrate(client);
  }, signal);
}
