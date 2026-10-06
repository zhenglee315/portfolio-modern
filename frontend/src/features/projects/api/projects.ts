import { useInfiniteQuery } from '@tanstack/react-query';
import type { Locale } from '@/i18n/config';
import { numberedQuery } from '@/shared/api/numbered-query';
import { projectsSchema } from '../schemas/projects';

/** Project detail remains in the validated list payload and shares numbered pagination. */
export function projectsQuery(locale: Locale, baseUrl?: string) {
  return numberedQuery('projects', locale, projectsSchema, { baseUrl });
}
/** Subscribe to ordered project pages; no secondary project entity store is created. */
export function useProjects(locale: Locale) {
  return useInfiniteQuery(projectsQuery(locale));
}
