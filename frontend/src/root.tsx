import type { ReactNode } from 'react';
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  useRouteLoaderData,
  type ShouldRevalidateFunction,
} from 'react-router';

import type { Route } from './+types/root';
import { AppProviders } from '@/app/providers/AppProviders';
import { defaultLocale } from '@/i18n/config';
import { publicLocale, publicRouteHeaders } from './routes/public-route';
import { appearanceBootstrapScript } from '@/features/appearance';
import 'bootstrap/dist/css/bootstrap.css';
import '@/assets/fonts/fonts.css';
import '@/styles/tokens.css';
import '@/styles/global.css';

/** Resolve the shared language contract for server and browser loaders. */
function getLocaleData(params: { locale?: string }) {
  return { locale: publicLocale(params.locale) };
}

/** Validate the URL language before rendering a route. */
export function loader({ params }: Route.LoaderArgs) {
  return getLocaleData(params);
}

/** Resolve browser navigation without a second server language read. */
export function clientLoader({ params }: Route.ClientLoaderArgs) {
  return getLocaleData(params);
}

/** Route errors and language responses follow the same publication freshness policy. */
export function headers() {
  return publicRouteHeaders();
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

/** Present server and browser route failures without exposing private error details. */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError missing={isRouteErrorResponse(error) && error.status === 404} />;
}

/** Share the public missing/error content across document and navigation failures. */
function RouteError({ missing }: { missing: boolean }) {
  return (
    <main className="container py-5">
      <h1>{missing ? 'Page not found' : 'Unable to load this page'}</h1>
      <p>{missing ? 'Please check the address.' : 'Please try again later.'}</p>
    </main>
  );
}
