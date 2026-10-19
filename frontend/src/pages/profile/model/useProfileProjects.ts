import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/http';
import {
  readProfileProjectPage,
  type ProfileDraft,
  type ProfileProjectPage,
} from '@/features/profile-content';

/** Local reordering/deletion may span server pages; fetch only the missing records' original pages. */
export function useProfileProjects(
  draft: ProfileDraft,
  required: string[],
  hydrate: (pages: ProfileProjectPage[]) => void,
  size = 6,
) {
  const scope = draft.projectScope;
  const missing = required.filter((id) => !draft.projects[id] && !scope?.loadedIds.includes(id));
  const pages = [
    ...new Set(missing.map((id) => Math.floor((scope?.sourceOrder.indexOf(id) ?? -1) / size) + 1)),
  ]
    .filter((page) => page > 0)
    .sort((a, b) => a - b);
  const query = useQuery({
    queryKey: ['profile-project-pages', draft.source?.siteId, draft.revision, size, ...pages],
    enabled: pages.length > 0,
    queryFn: async ({ signal }) => {
      const results = await Promise.all(
        pages.map((page) => readProfileProjectPage(page, signal, size)),
      );
      if (
        results.some(
          (result) =>
            result.revision !== draft.revision ||
            result.order.join('|') !== scope?.sourceOrder.join('|'),
        )
      )
        throw new ApiError('http', 409, 'PORTFOLIO_EDIT_CONFLICT');
      return results;
    },
    meta: { private: true },
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (query.data) hydrate(query.data);
  }, [query.data, hydrate]);
  return {
    loading: missing.length > 0 && !query.isError,
    error: query.isError,
    retry: () => void query.refetch(),
  };
}

/** Preserve a page across editor/back navigation, and clamp it after deletes without a blank tail. */
export function projectPageNumber(value: string | null, total: number, size = 6) {
  const page = value && /^\d+$/.test(value) ? Number(value) : 1;
  return Math.max(
    1,
    Math.min(Number.isSafeInteger(page) ? page : 1, Math.max(1, Math.ceil(total / size))),
  );
}

/** Match the private API's bounded numeric size; URL preferences never enter the saved draft. */
export function projectSizeNumber(value: string | null) {
  const size = value && /^\d+$/.test(value) ? Number(value) : 6;
  return Number.isInteger(size) && size >= 1 && size <= 100 ? size : 6;
}
