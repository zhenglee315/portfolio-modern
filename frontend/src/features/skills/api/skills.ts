import { useInfiniteQuery, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import type { Locale } from '@/i18n/config';
import { fillNumberedPages, numberedQuery } from '@/shared/api/numbered-query';
import type { NumberedPage } from '@/shared/schemas/records';
import { categoriesSchema, skillsSchema, type Skill, type SkillCategory } from '../schemas/skills';
import { assertSkillLabels, categorySkillLabels } from '../model/skills';

/** Reject inconsistent labels against all already validated owners of the same locale. */
function cachedOwnerLabels(client: QueryClient, locale: Locale, incoming: Skill[]) {
  const pages = client.getQueriesData<InfiniteData<NumberedPage<Skill>>>({
    queryKey: ['portfolio', locale, 'skills'],
  });
  assertSkillLabels([
    incoming,
    ...pages.flatMap(([, data]) => data?.pages.map((page) => page.items) ?? []),
  ]);
}

/** Validate category continuation and cross-category/owner consistency before caching. */
export function categoriesQuery(locale: Locale, baseUrl?: string) {
  return numberedQuery('skill-categories', locale, categoriesSchema, {
    baseUrl,
    validate: (result, client, previous) => {
      const categories = [...previous.flatMap((page) => page.items), ...result.items];
      categorySkillLabels(categories);
      cachedOwnerLabels(
        client,
        locale,
        categories.flatMap((category) => category.skills.items),
      );
    },
  });
}

/** Prepare the complete category index while keeping embedded owner previews untouched.
 * @param client Isolated server cache reused by the portfolio loader.
 * @param locale Public content locale represented by this snapshot.
 * @param baseUrl Server-only API origin; never serialized into the public query cache.
 * @remarks Optional continuation failures retain the validated prefix for browser recovery.
 */
export async function prefetchCategoryIndex(client: QueryClient, locale: Locale, baseUrl?: string) {
  const options = categoriesQuery(locale, baseUrl);
  await client.prefetchInfiniteQuery(options);
  if (!client.getQueryData(options.queryKey)) return;
  try {
    await fillNumberedPages(client, options);
  } catch {
    // Category failures cannot discard the profile or other independently usable sections.
  }
}

/** Keep owner identity and size in the key for measured previews and explicit continuation. */
export function skillsQuery(locale: Locale, ownerId: string, baseUrl?: string) {
  return numberedQuery('skills', locale, skillsSchema, {
    ownerId,
    baseUrl,
    validate: (result, client) => {
      const categories = client.getQueryData<InfiniteData<NumberedPage<SkillCategory>>>(
        categoriesQuery(locale).queryKey,
      );
      assertSkillLabels([
        result.items,
        ...(categories?.pages.flatMap((page) =>
          page.items.map((category) => category.skills.items),
        ) ?? []),
      ]);
      cachedOwnerLabels(client, locale, result.items);
    },
  });
}

/** Subscribe to category pages, each carrying a validated first-page owner preview. */
export function useCategories(locale: Locale) {
  return useInfiniteQuery(categoriesQuery(locale));
}

/** Seed owner cache from its category instead of issuing a redundant page-one request. */
export function useOwnerSkills(locale: Locale, category: SkillCategory, updatedAt: number) {
  return useInfiniteQuery({
    ...skillsQuery(locale, category.id),
    initialData: { pages: [category.skills], pageParams: [1] },
    initialDataUpdatedAt: updatedAt,
  });
}

/** Defend rendering when a category refresh conflicts with a cached owner preview. */
export function validateOwnerLabels(categories: SkillCategory[], skills: Skill[]) {
  assertSkillLabels([...categories.map((category) => category.skills.items), skills]);
}
