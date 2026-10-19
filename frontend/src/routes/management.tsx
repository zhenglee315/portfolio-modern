import { lazy, Suspense } from 'react';
import { data, isRouteErrorResponse, useRevalidator } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Route } from './+types/management';
import { getQueryClient } from '@/app/query-client';
import { forgetAuthSession, refreshAuthSession } from '@/features/auth/session';
import { useAccessDeniedRedirect } from '@/features/auth/actions';
import { canManage } from '@/features/auth/permissions';
import { isNotificationCancellation } from '@/i18n/notification-copy';
import { ApiError } from '@/shared/api/http';
import { LoadingIndicator } from '@/shared/ui/LoadingIndicator';
import { publicLocale, publicRouteHeaders } from './public-route';
import styles from './management.module.css';

const ManagementPage = lazy(() =>
  import('@/pages/management/ManagementPage').then((module) => ({
    default: module.ManagementPage,
  })),
);

/** Validate route identity before any session or record lookup. */
function managementLocale(params: { resource?: string; locale?: string }) {
  if (!['sites', 'users', 'roles', 'monitoring'].includes(params.resource ?? ''))
    throw new Response('Not Found', { status: 404 });
  return publicLocale(params.locale);
}

/** Server output contains language only; protected markup waits for the browser check. */
export function loader({ params }: Route.LoaderArgs) {
  return { locale: managementLocale(params) };
}

/** Require a fresh server-session decision before the protected page or list queries mount. */
export async function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  const route = { locale: managementLocale(params) };
  const resource = params.resource as 'sites' | 'users' | 'roles' | 'monitoring';
  const client = getQueryClient();
  try {
    const account = await refreshAuthSession(client, request.signal);
    return { ...route, access: canManage(account, resource) ? 'allowed' : 'denied' } as const;
  } catch (error) {
    request.signal.throwIfAborted();
    if (isNotificationCancellation(error)) throw error;
    if (
      error instanceof ApiError &&
      error.kind === 'http' &&
      [401, 403].includes(error.status ?? 0)
    ) {
      await forgetAuthSession(client);
      request.signal.throwIfAborted();
      return { ...route, access: 'denied' } as const;
    }
    throw data('Unable to verify access.', { status: 503, headers: publicRouteHeaders() });
  }
}

// The server never forwards account cookies or renders protected markup before this browser check.
clientLoader.hydrate = true as const;

/** Render only a neutral waiting state for SSR, first hydration and the allowed lazy page chunk. */
export function HydrateFallback() {
  const { t } = useTranslation();
  return (
    <main className={styles.waiting} data-management-check>
      <LoadingIndicator label={t('ui.loading')} />
    </main>
  );
}

/** Publish the permission warning before replacing the blocked URL with the localized 403 page. */
function DeniedEntry({ locale }: { locale: string }) {
  useAccessDeniedRedirect({ denied: true, destination: `/${locale}/access-denied` });
  return <HydrateFallback />;
}

/** An unavailable session stays closed and offers an explicit fresh retry instead of using old rights. */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useTranslation();
  const revalidator = useRevalidator();
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className={styles.waiting} data-management-check>
      <div className={styles.error} role="alert">
        {missing ? <h1>Page not found</h1> : <p>{t('ui.unavailable')}</p>}
        {!missing && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={revalidator.state === 'loading'}
            onClick={() => void revalidator.revalidate()}
          >
            {t('ui.retry')}
          </button>
        )}
      </div>
    </main>
  );
}

/** Keep administrative documents out of search indexes and private rows out of route hydration. */
export function meta() {
  return [{ title: 'Portfolio management' }, { name: 'robots', content: 'noindex, nofollow' }];
}

/** Reuse common document headers for permission-gated responses. */
export function headers() {
  return publicRouteHeaders();
}

/** Render a route chunk without prefetching administrative APIs on public portfolio visits. */
export default function ManagementRoute({ loaderData, params }: Route.ComponentProps) {
  const resource = params.resource;
  if (
    resource !== 'sites' &&
    resource !== 'users' &&
    resource !== 'roles' &&
    resource !== 'monitoring'
  )
    return null;
  if (!('access' in loaderData)) return <HydrateFallback />;
  if (loaderData.access === 'denied') return <DeniedEntry locale={loaderData.locale} />;
  return (
    <Suspense fallback={<HydrateFallback />}>
      <ManagementPage locale={loaderData.locale} resource={resource} />
    </Suspense>
  );
}
