import { useCallback, useEffect, useRef, useState } from 'react';
import { mobileQuery, reducedMotionQuery } from '@/shared/hooks/useMediaQuery';
import { resolveSection, sections } from '../model/navigation';

/** Own deep links, explicit history entries and passive scroll replacement.
 * @param locale Rebind after route language changes; query strings remain intact.
 * @param enabled Suspend portfolio observers while another page surface owns navigation.
 * Resize, font, scroll and animation resources are cleaned up on each binding.
 */
export function useSectionNavigation(locale: string, enabled = true) {
  const [active, setActive] = useState('overview');
  const restoring = useRef(false);
  const pending = useRef<string | undefined>(undefined);
  const deadline = useRef(0);
  const restoredLocale = useRef<string | undefined>(undefined);
  const navigate = useCallback(
    (id: string, push = true, smooth = true) => {
      if (!enabled) return;
      const target = document.getElementById(id);
      if (!target) return;
      const url = new URL(window.location.href);
      if (url.hash !== `#${id}`) {
        url.hash = id;
        window.history[push ? 'pushState' : 'replaceState'](window.history.state, '', url);
      }
      pending.current = id;
      deadline.current = performance.now() + (smooth ? 1400 : 80);
      setActive(id);
      target.scrollIntoView({
        block: 'start',
        behavior: smooth && !window.matchMedia(reducedMotionQuery).matches ? 'smooth' : 'instant',
      });
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    let frame = 0,
      restoreFrame = 0;
    let stopped = false;
    const update = (syncHash = true) => {
      frame = 0;
      if (pending.current && performance.now() >= deadline.current) pending.current = undefined;
      let current = pending.current;
      if (!current) {
        const root = document.scrollingElement;
        const line = Math.max(
          window.matchMedia(mobileQuery).matches ? 96 : 40,
          Math.min(220, innerHeight * 0.25),
        );
        current = sections[0]?.id;
        for (const section of sections) {
          if (
            (document.getElementById(section.id)?.getBoundingClientRect().top ?? Infinity) <= line
          )
            current = section.id;
        }
        if (
          root &&
          root.scrollTop > 0 &&
          root.scrollHeight - root.clientHeight - root.scrollTop <= 3
        )
          current = sections.at(-1)?.id;
      }
      if (current) {
        setActive(current);
        if (syncHash && !pending.current && (!location.hash || resolveSection(location.hash))) {
          const url = new URL(location.href);
          url.hash = current;
          if (location.hash !== url.hash) history.replaceState(history.state, '', url);
        }
      }
    };
    const schedule = () => {
      if (!frame && !stopped) frame = requestAnimationFrame(() => update());
    };
    const release = () => {
      restoring.current = false;
      pending.current = undefined;
      schedule();
    };
    const key = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key))
        release();
    };
    const restore = () => {
      if (stopped) return;
      restoredLocale.current = locale;
      restoring.current = true;
      navigate(resolveSection(location.hash) ?? 'overview', false, false);
      deadline.current = performance.now() + 2000;
    };
    // A route-level surface change can disable this binding before history restoration paints.
    const scheduleRestore = () => {
      cancelAnimationFrame(restoreFrame);
      restoreFrame = requestAnimationFrame(() => {
        restoreFrame = 0;
        restore();
      });
    };
    const scrollEnd = () => {
      if (!restoring.current) release();
      else schedule();
    };
    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = 0;
      if (restoredLocale.current !== locale) restore();
      else update(false);
    });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', scheduleRestore);
    window.addEventListener('popstate', scheduleRestore);
    window.addEventListener('scrollend', scrollEnd);
    window.addEventListener('wheel', release, { passive: true });
    window.addEventListener('touchstart', release, { passive: true });
    window.addEventListener('keydown', key);
    const observer = new ResizeObserver(() => {
      if (stopped) return;
      if (restoring.current && pending.current && performance.now() < deadline.current)
        document
          .getElementById(pending.current)
          ?.scrollIntoView({ block: 'start', behavior: 'instant' });
      schedule();
    });
    const main = document.getElementById('main-content');
    if (main) observer.observe(main);
    void document.fonts?.ready.then(() => {
      if (!stopped) schedule();
    });
    return () => {
      stopped = true;
      restoring.current = false;
      pending.current = undefined;
      observer.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(restoreFrame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('hashchange', scheduleRestore);
      window.removeEventListener('popstate', scheduleRestore);
      window.removeEventListener('scrollend', scrollEnd);
      window.removeEventListener('wheel', release);
      window.removeEventListener('touchstart', release);
      window.removeEventListener('keydown', key);
    };
  }, [locale, navigate, enabled]);
  return { active, navigate };
}
