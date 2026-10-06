import type { ReactNode } from 'react';
import {
  data,
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from 'react-router';

import type { Route } from './+types/root';
import { AppProviders } from '@/app/providers/AppProviders';
import { defaultLocale, localeSchema } from '@/i18n/config';
import 'bootstrap/dist/css/bootstrap.min.css';
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

clientLoader.hydrate = true as const;

/** Supply the document shell and language for every route. */
export function Layout({ children }: { children: ReactNode }) {
  const loaderData = useRouteLoaderData<typeof loader>('root');

  return (
    <html lang={loaderData?.locale ?? defaultLocale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
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
  const missing = isRouteErrorResponse(error) && error.status === 404;

  return (
    <main className="container py-5">
      <h1>{missing ? 'Page not found' : 'Unable to load this page'}</h1>
      <p>{missing ? 'Please check the address.' : 'Please try again later.'}</p>
    </main>
  );
}
