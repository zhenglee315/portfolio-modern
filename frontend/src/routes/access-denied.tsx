import { data } from 'react-router';
import type { Route } from './+types/access-denied';
import { createI18n } from '@/i18n/config';
import { AccessDeniedPage } from '@/pages/access-denied/AccessDeniedPage';
import { publicLocale, publicRouteHeaders } from './public-route';

/** Render a standalone 403 preview using language data only, without administrative API reads. */
export function loader({ params }: Route.LoaderArgs) {
  return data({ locale: publicLocale(params.locale) }, { status: 403 });
}

/** Keep the permission-status document out of search indexes. */
export function meta({ params }: Route.MetaArgs) {
  const i18n = createI18n(publicLocale(params.locale));
  return [
    { title: `403 · ${i18n.t('accessDenied.title')}` },
    { name: 'robots', content: 'noindex, nofollow' },
  ];
}

/** Reuse the shared response headers for a localized 403 document. */
export function headers() {
  return publicRouteHeaders();
}

/** Present loader-owned denial without mounting protected content or querying private APIs. */
export default function AccessDeniedRoute({ loaderData }: Route.ComponentProps) {
  return <AccessDeniedPage locale={loaderData.locale} />;
}
