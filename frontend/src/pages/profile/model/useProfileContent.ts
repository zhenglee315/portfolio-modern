import { useQuery } from '@tanstack/react-query';
import { loadProfileContent } from './loadProfileContent';

/** API source reads are private editor preparation, never a replacement public cache or mutation. */
export function useProfileContent(accountId: number, user: string) {
  return useQuery({
    queryKey: ['profile-content-source', accountId, user],
    queryFn: ({ signal }) => loadProfileContent(user, signal),
    meta: { private: true },
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
