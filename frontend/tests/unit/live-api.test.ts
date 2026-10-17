import { expect, it } from 'vitest';
import { createQueryClient } from '@/app/query-client';
import { siteQuery } from '@/features/site';
import { journeyQuery } from '@/features/journey';
import { experiencesQuery } from '@/features/experiences';
import { projectsQuery } from '@/features/projects';
import { categoriesQuery, skillsQuery } from '@/features/skills';
import { InfiniteQueryObserver } from '@tanstack/react-query';

const target = process.env.PORTFOLIO_API_SMOKE_TARGET;

/** Optional read-only contract smoke; never logs or saves response payloads. */
it.skipIf(!target).each(['en', 'zh-Hans', 'zh-Hant'] as const)(
  'live public API validates complete %s pages and owners',
  async (locale) => {
    const client = createQueryClient();
    try {
      await client.fetchQuery(siteQuery(locale, target));
      await client.fetchQuery(journeyQuery(locale, target));
      for (const observer of [
        new InfiniteQueryObserver(client, experiencesQuery(locale, target)),
        new InfiniteQueryObserver(client, projectsQuery(locale, target)),
      ]) {
        // Each domain observer validates continuation against already accepted cache pages.
        await observer.refetch({ throwOnError: true });
        while (observer.getCurrentResult().hasNextPage)
          await observer.fetchNextPage({ throwOnError: true });
        expect(observer.getCurrentResult().isError).toBe(false);
        observer.destroy();
      }
      const categories = new InfiniteQueryObserver(client, categoriesQuery(locale, target));
      await categories.refetch({ throwOnError: true });
      while (categories.getCurrentResult().hasNextPage)
        await categories.fetchNextPage({ throwOnError: true });
      for (const category of categories
        .getCurrentResult()
        .data?.pages.flatMap((page) => page.items) ?? []) {
        const options = skillsQuery(locale, category.id, target);
        client.setQueryData(options.queryKey, { pages: [category.skills], pageParams: [1] });
        const owner = new InfiniteQueryObserver(client, options);
        while (owner.getCurrentResult().hasNextPage)
          await owner.fetchNextPage({ throwOnError: true });
        expect(owner.getCurrentResult().isError).toBe(false);
        owner.destroy();
      }
      categories.destroy();
    } finally {
      client.clear();
    }
  },
  30_000,
);
