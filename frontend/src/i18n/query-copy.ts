import type { TFunction } from 'i18next';
import { ApiError } from '@/shared/api/http';

/** Map technical classifications to safe translated copy without exposing responses. */
export function queryCopy(t: TFunction, error: unknown, hasData: boolean, site = false) {
  const invalid = error instanceof ApiError && ['parse', 'contract'].includes(error.kind);
  const missingSite = site && error instanceof ApiError && error.status === 404;
  return {
    loading: t('ui.loading'),
    empty: t('ui.empty'),
    retry: t('ui.retry'),
    error: t(
      hasData ? 'ui.stale' : missingSite ? 'ui.noSite' : invalid ? 'ui.invalid' : 'ui.unavailable',
    ),
  };
}
