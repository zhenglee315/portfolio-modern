import { useInfiniteQuery } from '@tanstack/react-query';
import type { Locale } from '@/i18n/config';
import type { PortfolioAccess } from '@/shared/api/portfolio';
import { numberedQuery } from '@/shared/api/numbered-query';
import { usePortfolioScope } from '@/shared/context/portfolio';
import { projectsSchema } from '../schemas/projects';

/** Project detail remains in the validated list payload and shares numbered pagination. */
export function projectsQuery(
  locale: Locale,
  baseUrl?: string,
  siteId?: number,
  access: PortfolioAccess = 'public',
) {
  return numberedQuery('projects', locale, projectsSchema, { baseUrl, siteId, access });
}
/** Subscribe to ordered project pages; no secondary project entity store is created. */
export function useProjects(locale: Locale, enabled = true) {
  const scope = usePortfolioScope(enabled);
  return useInfiniteQuery({
    ...projectsQuery(locale, undefined, scope.siteId, scope.access),
    enabled: scope.enabled,
  });
}
