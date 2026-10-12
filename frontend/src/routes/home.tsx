import { HydrationBoundary } from '@tanstack/react-query';
import type { Route } from './+types/home';
import { defaultLocale, localeSchema, messages, supportedLocales } from '@/i18n/config';
import { PortfolioPage } from '@/pages/portfolio/PortfolioPage';
import { fullName, siteQuery } from '@/features/site';
import { currentMonthUTC } from '@/shared/lib/dates';
import { getQueryClient } from '@/app/query-client';
import { loadPortfolio } from './portfolio.server';
import { publicSiteOrigin } from '@/shared/lib/site-url';
import {
  portfolioReadError,
  publicLocale,
  publicPortfolioRoute,
  publicRouteHeaders,
} from './public-route';

/** Read the current public Site with one isolated cache for this server request. */
export async function loader({ params, request }: Route.LoaderArgs) {
  const { locale, selector } = publicPortfolioRoute(params, request.url);
  return loadPortfolio(locale, selector, request.signal);
}

/** Resolve browser navigation against current publication state before rendering. */
export async function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  const { locale, selector } = publicPortfolioRoute(params, request.url);
  const client = getQueryClient();
  try {
    const site = await client.fetchQuery({
      ...siteQuery(locale, undefined, selector),
      staleTime: 0,
    });
    return { selector, site, dehydratedState: undefined, nowMonth: currentMonthUTC() };
  } catch (error) {
    throw portfolioReadError(error);
  }
}

/** Public documents and route data must recheck publication rather than cache HTML. */
export function headers() {
  return publicRouteHeaders();
}

/** Derive portfolio identity and language links from the resolved public URL. */
export function meta({ loaderData: data, params }: Route.MetaArgs) {
  const parsed = localeSchema.safeParse(params.locale ?? defaultLocale);
  const locale = parsed.success ? parsed.data : defaultLocale;
  const copy = messages[locale];
  const title = data?.site
    ? `${fullName(data.site.profile)} · ${data.site.brand.titleSub}`
    : copy.profile.title;
  const description = data?.site?.profile.content ?? copy.profile.description;
  const origin = publicSiteOrigin(import.meta.env.VITE_PUBLIC_SITE_URL);
  /** Keep explicit ID and handle selections distinct from the default canonical. */
  function languagePath(language: string) {
    const target = language === 'x-default' ? defaultLocale : language;
    if (data?.selector.site_id !== undefined) return `/${target}?site_id=${data.selector.site_id}`;
    return data?.selector.user
      ? `/${target}/${data.selector.user}`
      : target === defaultLocale
        ? '/'
        : `/${target}`;
  }
  const canonical = data?.site && origin ? `${origin}${languagePath(locale)}` : undefined;
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    ...(!data?.site ? [{ name: 'robots', content: 'noindex' }] : []),
    ...(canonical && origin
      ? [
          { tagName: 'link', rel: 'canonical', href: canonical },
          { property: 'og:url', content: canonical },
          ...[...supportedLocales, 'x-default'].map((language) => ({
            tagName: 'link',
            rel: 'alternate',
            hrefLang: language,
            href: `${origin}${languagePath(language)}`,
          })),
        ]
      : []),
  ];
}

/** Hydrate the owner-scoped server snapshot before subscribing to feature queries. */
export default function PortfolioRoute({ loaderData, params }: Route.ComponentProps) {
  return (
    <HydrationBoundary state={loaderData?.dehydratedState}>
      <PortfolioPage
        locale={publicLocale(params.locale)}
        selector={loaderData.selector}
        site={loaderData?.site}
        nowMonth={loaderData?.nowMonth ?? currentMonthUTC()}
      />
    </HydrationBoundary>
  );
}
