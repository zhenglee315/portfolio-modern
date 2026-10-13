import { useEffect } from 'react';
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import type { Locale } from '@/i18n/config';
import { numberedQuery, pageRecords } from '@/shared/api/numbered-query';
import { portfolioKey, type PortfolioAccess } from '@/shared/api/portfolio';
import { usePortfolioScope } from '@/shared/context/portfolio';
import type { NumberedPage } from '@/shared/schemas/records';
import { categoriesSchema, skillsSchema, type Skill, type SkillCategory } from '../schemas/skills';
import { assertSkillLabels, categorySkillLabels } from '../model/skills';

/** Reject inconsistent labels against validated owners in the same Site and language. */
function cachedOwnerLabels(
  client: QueryClient,
  locale: Locale,
  incoming: Skill[],
  siteId?: number,
  access: PortfolioAccess = 'public',
) {
  const pages = client.getQueriesData<InfiniteData<NumberedPage<Skill>>>({
    queryKey: [...portfolioKey(locale, { site_id: siteId }, access), 'skills'],
  });
  assertSkillLabels([incoming, ...pages.map(([, data]) => pageRecords(data))]);
}

/** Validate category continuation and cross-category/owner consistency before caching. */
export function categoriesQuery(
  locale: Locale,
  baseUrl?: string,
  siteId?: number,
  access: PortfolioAccess = 'public',
) {
  return numberedQuery('skill-categories', locale, categoriesSchema, {
    baseUrl,
    siteId,
    access,
    validate: (result, client, previous) => {
      const categories = [...previous.flatMap((page) => page.items), ...result.items];
      categorySkillLabels(categories);
      cachedOwnerLabels(
        client,
        locale,
        categories.flatMap((category) => category.skills.items),
        siteId,
        access,
      );
    },
  });
}

/** Keep owner identity and size in the key for measured previews and explicit continuation. */
export function skillsQuery(
  locale: Locale,
  ownerId: string,
  baseUrl?: string,
  siteId?: number,
  access: PortfolioAccess = 'public',
) {
  return numberedQuery('skills', locale, skillsSchema, {
    ownerId,
    baseUrl,
    siteId,
    access,
    validate: (result, client) => {
      const categories = client.getQueryData<InfiniteData<NumberedPage<SkillCategory>>>(
        categoriesQuery(locale, undefined, siteId, access).queryKey,
      );
      assertSkillLabels([
        result.items,
        ...pageRecords(categories).map((category) => category.skills.items),
      ]);
      cachedOwnerLabels(client, locale, result.items, siteId, access);
    },
  });
}

/** Subscribe to category pages, each carrying a validated first-page owner preview. */
export function useCategories(locale: Locale, enabled = true) {
  const scope = usePortfolioScope(enabled);
  return useInfiniteQuery({
    ...categoriesQuery(locale, undefined, scope.siteId, scope.access),
    enabled: scope.enabled,
  });
}

/** Seed owner cache from its category instead of issuing a redundant page-one request. */
export function useOwnerSkills(locale: Locale, category: SkillCategory, updatedAt: number) {
  const scope = usePortfolioScope();
  const client = useQueryClient();
  const options = skillsQuery(locale, category.id, undefined, scope.siteId, scope.access);
  useEffect(() => {
    const cached = client.getQueryData<InfiniteData<NumberedPage<Skill>>>(options.queryKey);
    if (
      !cached ||
      (client.getQueryState(options.queryKey)?.dataUpdatedAt ?? 0) >= updatedAt ||
      JSON.stringify(cached.pages[0]) === JSON.stringify(category.skills)
    )
      return;
    // A new category preview invalidates an old continuation instead of mixing publication snapshots.
    client.setQueryData(
      options.queryKey,
      { pages: [category.skills], pageParams: [1] },
      { updatedAt },
    );
  }, [client, options.queryKey, category.skills, updatedAt]);
  return useInfiniteQuery({
    ...options,
    // The category owns page one; its demanded preview or disclosure requests continuation.
    enabled: false,
    initialData: { pages: [category.skills], pageParams: [1] },
    initialDataUpdatedAt: updatedAt,
  });
}

/** Defend rendering when a category refresh conflicts with a cached owner preview. */
export function validateOwnerLabels(categories: SkillCategory[], skills: Skill[]) {
  assertSkillLabels([...categories.map((category) => category.skills.items), skills]);
}
