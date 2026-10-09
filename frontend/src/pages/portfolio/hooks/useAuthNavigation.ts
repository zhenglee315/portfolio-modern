import { useCallback, useEffect, useId, useRef } from 'react';
import type { Locale } from '@/i18n/config';

const entryKey = 'portfolioAuthEntry';
const loginRequested = () => new URL(window.location.href).searchParams.get('view') === 'login';

/**
 * Return enter/leave actions that keep sign-in on the locale route and preserve other URL state.
 * active covers the full transition and owns Escape/focus return; visible acquires the body lock.
 * leave goes back through entries owned by this mounted page, or replaces a direct-login URL.
 * Delay body locking until the mobile drawer releases it, then restore the original styles.
 * Effects remove history/key listeners and cancel pending lock timers and focus frames.
 */
export function useAuthNavigation({
  locale,
  active,
  visible,
  open,
  back,
  dismissContact,
}: {
  locale: Locale;
  active: boolean;
  visible: boolean;
  open: () => void;
  back: () => void;
  dismissContact: () => void;
}) {
  const owner = useId();
  const sequence = useRef(0);
  // Only entries made by this live page may navigate back; a direct link must stay on the site.
  const entries = useRef(new Set<string>());
  const returnFocus = useRef<HTMLElement | null>(null);
  const wasActive = useRef(false);
  const start = useCallback(() => {
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      focused !== document.body &&
      !focused.closest('[data-auth-panel]')
    )
      returnFocus.current = focused;
    dismissContact();
    open();
  }, [dismissContact, open]);

  const enter = useCallback(() => {
    if (!loginRequested()) {
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'login');
      const id = `${owner}-${++sequence.current}`;
      entries.current.add(id);
      // React Router owns other state fields; preserve them alongside this page's marker.
      window.history.pushState({ ...window.history.state, [entryKey]: id }, '', url);
    }
    start();
  }, [owner, start]);

  const leave = useCallback(() => {
    const marker: unknown = window.history.state?.[entryKey];
    if (loginRequested() && typeof marker === 'string' && entries.current.has(marker)) {
      window.history.back();
      // Stay suspended until popstate: resuming earlier would let section restoration
      // override the transition's exact saved scroll position during this history event.
      return;
    } else if (loginRequested()) {
      const url = new URL(window.location.href);
      url.searchParams.delete('view');
      const state = { ...window.history.state };
      delete state[entryKey];
      window.history.replaceState(state, '', url);
    }
    back();
  }, [back]);

  useEffect(() => {
    const sync = () => {
      if (loginRequested()) start();
      else back();
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [locale, start, back]);

  useEffect(() => {
    // The mobile drawer must release its own body lock before this surface acquires it.
    if (!visible) return;
    let restore: (() => void) | undefined;
    const lock = () => {
      const originalOverflow = document.body.style.overflow;
      const originalPadding = document.body.style.paddingRight;
      const gutter = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
      const padding = parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.overflow = 'hidden';
      if (gutter) document.body.style.paddingRight = `${padding + gutter}px`;
      restore = () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPadding;
      };
    };
    // Reduced motion can reveal immediately, while Bootstrap still releases its drawer.
    const timer = document.getElementById('mobile-navigation') ? setTimeout(lock, 400) : undefined;
    if (!timer) lock();
    return () => {
      clearTimeout(timer);
      restore?.();
    };
  }, [visible]);

  useEffect(() => {
    if (!active) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Existing menus dismiss themselves first and keep the page available.
      if (document.querySelector('[data-auth-panel] [aria-expanded="true"]')) return;
      event.preventDefault();
      leave();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [active, leave]);

  useEffect(() => {
    const returned = wasActive.current && !active;
    wasActive.current = active;
    if (!returned) return;
    const frame = requestAnimationFrame(() => {
      const saved = returnFocus.current;
      const target =
        saved?.isConnected && saved.getClientRects().length
          ? saved
          : Array.from(
              document.querySelectorAll<HTMLElement>(
                '[data-login-trigger], [aria-controls="mobile-navigation"]',
              ),
            ).find((element) => element.getClientRects().length && !element.closest('[inert]'));
      // Mobile drawer entries disappear; return to the visible menu trigger instead.
      const visible = target?.getClientRects().length
        ? target
        : document.querySelector<HTMLElement>('[aria-controls="mobile-navigation"]');
      visible?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return { enter, leave };
}
