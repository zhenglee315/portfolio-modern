import { useQuery } from '@tanstack/react-query';
import type { Locale } from '@/i18n/config';
import { ApiError } from '@/shared/api/http';
import {
  portfolioQuery,
  type PortfolioAccess,
  type PortfolioSiteSelector,
} from '@/shared/api/portfolio';
import { usePortfolioContext } from '@/shared/context/portfolio';
import { siteSchema, type Site } from '../schemas/site';

/** Cache Site by its public selector and language; private origins never identify queries. */
export function siteQuery(
  locale: Locale,
  baseUrl?: string,
  selector: PortfolioSiteSelector = {},
  access: PortfolioAccess = 'public',
) {
  return portfolioQuery({ resource: 'site', selector }, locale, siteSchema, {
    baseUrl,
    access,
    validate: (site) => {
      if (
        (selector.user !== undefined && site.user !== selector.user) ||
        (selector.site_id !== undefined && site.site_id !== selector.site_id)
      )
        throw new ApiError('contract');
    },
  });
}

/** Subscribe to the validated Site DTO without replicating it in component state. */
export function useSite(
  locale: Locale,
  selector?: PortfolioSiteSelector,
  initialSite?: Site,
  access?: PortfolioAccess,
) {
  const context = usePortfolioContext();
  return useQuery({
    ...siteQuery(locale, undefined, selector ?? context?.selector, access ?? context?.access),
    initialData: initialSite,
  });
}
