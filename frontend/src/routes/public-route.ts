import { data } from 'react-router';
import { defaultLocale, localeSchema, type Locale } from '@/i18n/config';
import { ApiError } from '@/shared/api/http';
import type { PortfolioSiteSelector } from '@/shared/api/portfolio';
import { publicUserSchema } from '@/shared/schemas/portfolio';

/** Use one publication freshness policy for public documents and route data. */
export function publicRouteHeaders() {
  return { 'Cache-Control': 'no-store' };
}

/** Create the same sanitized missing/service response in server and browser routing.
 * @param status Public status; upstream exception details never enter route data.
 * @returns Sanitized router error data with the shared publication freshness headers.
 */
export function publicRouteError(status: 404 | 503) {
  return data(status === 404 ? 'Page not found.' : 'Public content is temporarily unavailable.', {
    status,
    headers: publicRouteHeaders(),
  });
}

/** Preserve a missing public Site while hiding other API or transport failure details.
 * @param error Internal API or transport exception, never serialized into route data.
 * @returns A public 404 for a missing Site, or 503 for every other failed read.
 */
export function portfolioReadError(error: unknown) {
  return publicRouteError(
    error instanceof ApiError && error.kind === 'http' && error.status === 404 ? 404 : 503,
  );
}

/** Validate the shared URL language before any public API read.
 * @param locale Optional path segment; an omitted language uses the existing English default.
 * @returns A supported language.
 * @throws A public 404 for an unsupported language segment.
 */
export function publicLocale(locale?: string) {
  const result = localeSchema.safeParse(locale ?? defaultLocale);
  if (!result.success) throw publicRouteError(404);
  return result.data;
}

/** Resolve the portfolio's validated public selector without consulting account sessions.
 * @param params URL language and optional public handle.
 * @param url Request URL carrying an optional site_id; other search parameters remain available to the page.
 * @returns Validated language and Site selector; omitted selectors keep the published default.
 * @throws A public 404 for invalid language, handles, IDs or conflicting selectors.
 */
export function publicPortfolioRoute(
  params: { locale?: string; user?: string },
  url: string,
): { locale: Locale; selector: PortfolioSiteSelector } {
  const locale = publicLocale(params.locale);
  const user = params.user === undefined ? undefined : publicUserSchema.safeParse(params.user);
  if (user && !user.success) throw publicRouteError(404);
  const ids = new URL(url).searchParams.getAll('site_id');
  if (ids.length) {
    if (user || ids.length !== 1 || !/^\d+$/.test(ids[0]!)) throw publicRouteError(404);
    const siteId = Number(ids[0]);
    if (!Number.isSafeInteger(siteId) || siteId < 1 || siteId > 2_147_483_647)
      throw publicRouteError(404);
    return { locale, selector: { site_id: siteId } };
  }
  return { locale, selector: user ? { user: user.data } : {} };
}
