import { dehydrate, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { createQueryClient } from '@/app/query-client';
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
import { fillNumberedPages, type numberedQuery } from '@/shared/api/numbered-query';
import type { NumberedPage } from '@/shared/schemas/records';

type Pages<T> = InfiniteData<NumberedPage<T>>;
export type LocaleScope = {
  site: boolean;
  journey?: { id: number }[];
  experiences?: Pages<Experience>;
  projects?: Pages<Project>;
  categories?: Pages<SkillCategory>;
  owners: { id: string; data: Pages<Skill> }[];
};

/** Capture only validated loaded ranges, including closed-but-cached collection pages. */
export function captureLocaleScope(client: QueryClient, locale: Locale): LocaleScope {
  return {
    site: !!client.getQueryData(siteQuery(locale).queryKey),
    journey: client.getQueryData(journeyQuery(locale).queryKey),
    experiences: client.getQueryData(experiencesQuery(locale).queryKey),
    projects: client.getQueryData(projectsQuery(locale).queryKey),
    categories: client.getQueryData(categoriesQuery(locale).queryKey),
    owners: client
      .getQueriesData<Pages<Skill>>({ queryKey: ['portfolio', locale, 'skills'] })
      .flatMap(([key, data]) => (typeof key[3] === 'string' && data ? [{ id: key[3], data }] : [])),
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
  sameIds(
    source.pages.flatMap((page) => page.items),
    result.pages.flatMap((page) => page.items),
  );
}

/** Fetch a target locale atomically while leaving the visible cache and URL intact.
 * Category previews seed owner page one; all previously loaded owner ranges continue.
 * Caller cancellation destroys all staging requests and cannot commit partial translations.
 */
export async function prepareLocale(scope: LocaleScope, locale: Locale, signal: AbortSignal) {
  const client = createQueryClient();
  const cancel = () => {
    void client.cancelQueries();
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    const tasks: Promise<unknown>[] = [];
    if (scope.site) tasks.push(client.fetchQuery(siteQuery(locale)));
    if (scope.journey)
      tasks.push(
        client
          .fetchQuery(journeyQuery(locale))
          .then((result) => sameIds(scope.journey ?? [], result)),
      );
    if (scope.experiences)
      tasks.push(preparePages(client, experiencesQuery(locale), scope.experiences));
    if (scope.projects) tasks.push(preparePages(client, projectsQuery(locale), scope.projects));
    if (scope.categories)
      tasks.push(
        preparePages(client, categoriesQuery(locale), scope.categories).then(async () => {
          const categories =
            client
              .getQueryData(categoriesQuery(locale).queryKey)
              ?.pages.flatMap((page) => page.items) ?? [];
          categorySkillLabels(categories);
          const owners = await Promise.allSettled(
            scope.owners.map((owner) => {
              const category = categories.find((item) => item.id === owner.id);
              if (!category) throw new ApiError('contract');
              return preparePages(
                client,
                skillsQuery(locale, owner.id),
                owner.data,
                category.skills,
              );
            }),
          );
          if (owners.some((result) => result.status === 'rejected')) throw new ApiError('contract');
        }),
      );
    const results = await Promise.allSettled(tasks);
    signal.throwIfAborted();
    if (results.some((result) => result.status === 'rejected')) throw new ApiError('contract');
    return dehydrate(client);
  } finally {
    signal.removeEventListener('abort', cancel);
    client.clear();
  }
}
