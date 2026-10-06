import { HydrationBoundary } from '@tanstack/react-query';
import type { Route } from './+types/home';
import { defaultLocale, localeSchema, messages } from '@/i18n/config';
import { PortfolioPage } from '@/pages/portfolio/PortfolioPage';
import { fullName, siteQuery } from '@/features/site';
import { currentMonthUTC } from '@/shared/lib/dates';
import { getQueryClient } from '@/app/query-client';
import { loadPortfolio } from './portfolio.server';
import { publicSiteOrigin } from '@/shared/lib/site-url';

/** Read public profile content at build time with a fresh cache per locale. */
export async function loader({ params }: Route.LoaderArgs) {
  const locale = localeSchema.parse(params.locale ?? defaultLocale);
  return loadPortfolio(locale);
}

/** Browser route navigation uses the existing cache and independently recoverable queries. */
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const locale = localeSchema.parse(params.locale ?? defaultLocale);
  const client = getQueryClient();
  await client.prefetchQuery(siteQuery(locale));
  return {
    site: client.getQueryData(siteQuery(locale).queryKey),
    dehydratedState: undefined,
    nowMonth: currentMonthUTC(),
  };
}

/** Derive real identity and introduction metadata from validated API content. */
export function meta({ loaderData: data, params }: Route.MetaArgs) {
  const parsed = localeSchema.safeParse(params.locale ?? defaultLocale);
  const copy = messages[parsed.success ? parsed.data : defaultLocale];
  const locale = parsed.success ? parsed.data : defaultLocale;
  const title = data?.site
    ? `${fullName(data.site.profile)} · ${data.site.brand.titleSub}`
    : copy.profile.title;
  const description = data?.site?.profile.content ?? copy.profile.description;
  const origin = publicSiteOrigin(import.meta.env.VITE_PUBLIC_SITE_URL);
  const canonical = origin ? `${origin}${locale === 'en' ? '/' : `/${locale}`}` : undefined;
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    ...(canonical && origin
      ? [
          { tagName: 'link', rel: 'canonical', href: canonical },
          { property: 'og:url', content: canonical },
          ...['en', 'zh-Hans', 'zh-Hant', 'x-default'].map((language) => ({
            tagName: 'link',
            rel: 'alternate',
            hrefLang: language,
            href: `${origin}${language === 'en' || language === 'x-default' ? '/' : `/${language}`}`,
          })),
        ]
      : []),
  ];
}

/** Hydrate the server snapshot before subscribing to feature queries. */
export default function PortfolioRoute({ loaderData, params }: Route.ComponentProps) {
  return (
    <HydrationBoundary state={loaderData?.dehydratedState}>
      <PortfolioPage
        locale={localeSchema.parse(params.locale ?? defaultLocale)}
        nowMonth={loaderData?.nowMonth ?? currentMonthUTC()}
      />
    </HydrationBoundary>
  );
}
