import { useSyncExternalStore, type ReactNode } from 'react';
import {
  data,
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  useParams,
  useRouteLoaderData,
  type ShouldRevalidateFunction,
} from 'react-router';

import type { Route } from './+types/root';
import { AppProviders } from '@/app/providers/AppProviders';
import { defaultLocale, localeSchema, messages } from '@/i18n/config';
import { appearanceBootstrapScript } from '@/features/appearance';
import '@/styles/bootstrap.scss';
import '@/assets/fonts/fonts.css';
import '@/styles/tokens.css';
import '@/styles/global.css';

/** Resolve the shared language contract for build-time and browser loaders. */
function getLocaleData(params: { locale?: string }) {
  const result = localeSchema.safeParse(params.locale ?? defaultLocale);

  if (!result.success) {
    throw data('Page not found.', { status: 404 });
  }

  return { locale: result.data };
}

/** Validate the URL language before rendering or pre-rendering a route. */
export function loader({ params }: Route.LoaderArgs) {
  return getLocaleData(params);
}

/** Resolve browser navigation without requiring a frontend runtime server. */
export function clientLoader({ params }: Route.ClientLoaderArgs) {
  return getLocaleData(params);
}

// Valid initial documents already carry validated loader data. Keep this pure
// URL validator for navigation without replacing pre-rendered content on hydration.

/** Keep invalid-language documents consistent while their client route errors resolve.
 * Layout owns scripts; both the loading shell and route errors remain plain content.
 */
export function HydrateFallback() {
  const params = useParams();
  const snapshot = useRouteLoaderData<typeof loader>('root');
  // A static SPA fallback carries the build's default-locale snapshot and loading
  // markup. Preserve that markup until the child validates its actual URL.
  if (!snapshot && !localeSchema.safeParse(params.locale ?? defaultLocale).success)
    return <RouteError missing />;
  return <RouteLoading />;
}

/** Keep the static SPA loading markup identical wherever an initial router error lands. */
function RouteLoading() {
  return (
    <main className="container py-5" aria-busy="true">
      <p role="status">{messages[defaultLocale].ui.loading}</p>
    </main>
  );
}

/** Parent routes also consume the child's locale, so pathname changes must revalidate it. */
export const shouldRevalidate: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}) => currentUrl.pathname !== nextUrl.pathname || defaultShouldRevalidate;

/** Supply the document shell and language for every route. */
export function Layout({ children }: { children: ReactNode }) {
  const loaderData = useRouteLoaderData<typeof loader>('root');

  return (
    <html lang={loaderData?.locale ?? defaultLocale} data-theme="mist" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrapScript }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Mount shared application services around the current route. */
export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <AppProviders locale={loaderData.locale}>
      <Outlet />
    </AppProviders>
  );
}

/** Present route errors without exposing production error details. */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const snapshot = useRouteLoaderData<typeof loader>('root');
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const missing = isRouteErrorResponse(error) && error.status === 404;
  // Unmatched static URLs may enter this boundary on the very first client render.
  // Match their delivered SPA shell during hydration, then show the resolved error.
  if (missing && snapshot && !hydrated) return <RouteLoading />;
  return <RouteError missing={missing} />;
}

/** Hydration switches React's server/client snapshots without an external event source. */
const subscribeToHydration = () => () => {};

/** Share identical missing/error content across route errors and initial SPA fallback. */
function RouteError({ missing }: { missing: boolean }) {
  return (
    <main className="container py-5">
      <h1>{missing ? 'Page not found' : 'Unable to load this page'}</h1>
      <p>{missing ? 'Please check the address.' : 'Please try again later.'}</p>
    </main>
  );
}
