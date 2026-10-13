import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRevalidator } from 'react-router';
import type { Route } from './+types/portfolio-preview';
import { getQueryClient } from '@/app/query-client';
import { refreshAuthSession } from '@/features/auth/session';
import { canManage } from '@/features/auth/permissions';
import { PortfolioPage } from '@/pages/portfolio/PortfolioPage';
import { currentMonthUTC } from '@/shared/lib/dates';
import { LoadingIndicator } from '@/shared/ui/LoadingIndicator';
import { SectionState } from '@/shared/ui/SectionState';
import { publicLocale, publicRouteHeaders } from './public-route';
import styles from './management.module.css';

function previewRoute(params: { locale?: string; siteId?: string }) {
  const locale = publicLocale(params.locale);
  if (
    !params.siteId ||
    !/^\d{1,10}$/.test(params.siteId) ||
    !Number.isSafeInteger(Number(params.siteId)) ||
    Number(params.siteId) < 1 ||
    Number(params.siteId) > 2_147_483_647
  )
    throw new Response('Not Found', { status: 404 });
  return { locale, siteId: Number(params.siteId), nowMonth: currentMonthUTC() };
}

/** SSR carries no private data; the embedded document verifies the current session on hydration. */
export function loader({ params }: Route.LoaderArgs) {
  return previewRoute(params);
}
export async function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  const route = previewRoute(params);
  const account = await refreshAuthSession(getQueryClient(), request.signal);
  return { ...route, allowed: canManage(account, 'sites') };
}
clientLoader.hydrate = true as const;
export function headers() {
  return publicRouteHeaders();
}
export function meta() {
  return [{ title: 'Portfolio preview' }, { name: 'robots', content: 'noindex, nofollow' }];
}
export function HydrateFallback() {
  const { t } = useTranslation();
  return (
    <div className={styles.waiting}>
      <LoadingIndicator label={t('ui.loading')} />
    </div>
  );
}
export function ErrorBoundary() {
  const { t } = useTranslation();
  const retry = useRevalidator();
  return (
    <div className={styles.waiting}>
      <SectionState message={t('ui.unavailable')}>
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => void retry.revalidate()}
          disabled={retry.state === 'loading'}
        >
          {t('ui.retry')}
        </button>
      </SectionState>
    </div>
  );
}
export default function PortfolioPreviewRoute({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const selector = useMemo(() => ({ site_id: loaderData.siteId }), [loaderData.siteId]);
  useEffect(() => {
    const childDialogEvents = new WeakSet<KeyboardEvent>();
    const capture = (event: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) childDialogEvents.add(event);
    };
    const escape = (event: KeyboardEvent) => {
      if (
        window.parent === window ||
        event.defaultPrevented ||
        childDialogEvents.has(event) ||
        document.querySelector('[aria-modal="true"]')
      )
        return;
      if (event.key === 'Tab' && !event.shiftKey) {
        const controls = [
          ...document.querySelectorAll<HTMLElement>(
            'a[href],button,input,select,textarea,[tabindex]',
          ),
        ].filter(
          (node) =>
            node.tabIndex >= 0 &&
            !node.matches(':disabled') &&
            !node.closest('[hidden],[inert]') &&
            node.getClientRects().length > 0,
        );
        if (document.activeElement === controls.at(-1)) {
          event.preventDefault();
          window.parent.postMessage(
            { type: 'portfolio-preview-focus-close' },
            window.location.origin,
          );
        }
      }
      if (event.key !== 'Escape') return;
      window.parent.postMessage({ type: 'portfolio-preview-close' }, window.location.origin);
    };
    // Remember child ownership before its Escape handler removes it; honor prevented events afterward.
    window.addEventListener('keydown', capture, true);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', capture, true);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  if (!('allowed' in loaderData)) return <HydrateFallback />;
  if (!loaderData.allowed)
    return (
      <div className={styles.waiting}>
        <SectionState message={t('management.previewDenied')} />
      </div>
    );
  return (
    <PortfolioPage
      locale={loaderData.locale}
      nowMonth={loaderData.nowMonth}
      selector={selector}
      embedded
    />
  );
}
