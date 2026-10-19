import { data, redirect, useRevalidator, type ShouldRevalidateFunction } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Route } from './+types/profile';
import { getQueryClient } from '@/app/query-client';
import { refreshAuthSession } from '@/features/auth/session';
import { ApiError } from '@/shared/api/http';
import { LoadingIndicator } from '@/shared/ui/LoadingIndicator';
import { publicLocale, publicRouteHeaders } from './public-route';
import { ProfilePage } from '@/pages/profile/ProfilePage';
import styles from './management.module.css';

/** Server rendering emits no browser drafts and performs no private profile content request. */
export function loader({ params }: Route.LoaderArgs) {
  return { locale: publicLocale(params.locale) };
}

/** Reuse existing session verification; content reads reuse the existing Portfolio endpoints. */
export async function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  const locale = publicLocale(params.locale);
  try {
    const account = await refreshAuthSession(getQueryClient(), request.signal);
    if (!account) return redirect(`/${locale}?view=login`);
    return { locale };
  } catch (error) {
    request.signal.throwIfAborted();
    if (error instanceof ApiError && [401, 403].includes(error.status ?? 0))
      return redirect(`/${locale}?view=login`);
    throw data('Unable to verify access.', { status: 503, headers: publicRouteHeaders() });
  }
}
clientLoader.hydrate = true as const;

/** Tab, selected-record and content-language changes are local; they do not refetch identity. */
export const shouldRevalidate: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}) => (currentUrl.pathname !== nextUrl.pathname ? defaultShouldRevalidate : false);

function ProfileLoading() {
  const { t } = useTranslation();
  return (
    <main className={styles.waiting}>
      <LoadingIndicator label={t('ui.loading')} />
    </main>
  );
}

// React Router loads this route separately from public portfolio screens.
export const HydrateFallback = ProfileLoading;

/** Allow explicit identity revalidation while withholding owner content after route failure. */
export function ErrorBoundary() {
  const { t } = useTranslation();
  const revalidator = useRevalidator();
  return (
    <main className={styles.waiting}>
      <div className={styles.error}>
        <p role="alert">{t('ui.unavailable')}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void revalidator.revalidate()}
        >
          {t('ui.retry')}
        </button>
      </div>
    </main>
  );
}

/** Exclude owner editing documents from indexing; public portfolios own their separate metadata. */
export function meta() {
  return [{ title: 'Profile · Portfolio' }, { name: 'robots', content: 'noindex, nofollow' }];
}
/** Apply shared document headers without duplicating the route response policy. */
export function headers() {
  return publicRouteHeaders();
}

/** Compose authenticated editing from the validated route locale; content remains page-owned. */
export default function ProfileRoute({ loaderData }: Route.ComponentProps) {
  return <ProfilePage locale={loaderData.locale} />;
}
