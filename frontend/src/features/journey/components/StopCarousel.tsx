import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { dateCopy } from '@/i18n/date-copy';
import { periodLabels } from '@/shared/lib/dates';
import { reducedMotionQuery, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { Icon } from '@/shared/ui/Icon';
import type { JourneyStop } from '../schemas/journey';
import styles from './Journey.module.css';

/** Browse complete career destinations without moving the surrounding document.
 * @param locale Display locale for shared compact period labels.
 * @param onSelect Select a stable ID; the second argument requests touch/keyboard detail.
 * @param onBlur Optional dismissal when keyboard focus leaves the destination strip.
 * Arrow visibility follows measured overflow; scroll, fonts and resize share one rAF update.
 */
export function StopCarousel({
  items,
  selectedId,
  locale,
  onSelect,
  onBlur,
}: {
  items: JourneyStop[];
  selectedId: number;
  locale: Locale;
  onSelect: (id: number, showDetail?: boolean) => void;
  onBlur?: () => void;
}) {
  const { t } = useTranslation();
  const reduced = useMediaQuery(reducedMotionQuery);
  const container = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ overflow: false, previous: false, next: false });
  useEffect(() => {
    const root = strip.current,
      frameBox = container.current;
    if (!root || !frameBox) return;
    let frame = 0,
      stopped = false;
    /** Measure intrinsic destination widths against the whole carousel, before arrow insets. */
    const measure = () => {
      frame = 0;
      if (stopped) return;
      const width = Array.from(root.children).reduce(
        (sum, child) => sum + child.getBoundingClientRect().width,
        0,
      );
      const overflow = width > frameBox.clientWidth + 1;
      const max = Math.max(0, root.scrollWidth - root.clientWidth);
      const next = {
        overflow,
        previous: root.scrollLeft > 1,
        next: root.scrollLeft < max - 1,
      };
      setBounds((previous) =>
        previous.overflow === next.overflow &&
        previous.previous === next.previous &&
        previous.next === next.next
          ? previous
          : next,
      );
    };
    /** Coalesce resize and scroll callbacks; no idle animation loop is retained. */
    const schedule = () => {
      if (!frame && !stopped) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    observer.observe(frameBox);
    root.addEventListener('scroll', schedule, { passive: true });
    schedule();
    void document.fonts?.ready.then(schedule);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener('scroll', schedule);
    };
  }, [items, locale]);
  useEffect(() => {
    const root = strip.current,
      selected = root?.querySelector<HTMLElement>(`[data-id="${selectedId}"]`);
    if (!root || !selected) return;
    const box = root.getBoundingClientRect(),
      target = selected.getBoundingClientRect();
    const delta =
      target.left < box.left
        ? target.left - box.left
        : target.right > box.right
          ? target.right - box.right
          : 0;
    if (Math.abs(delta) > 1) root.scrollBy({ left: delta, behavior: 'instant' });
  }, [items, selectedId, bounds.overflow]);
  /** Advance by one useful strip segment with the current motion preference. */
  const slide = (direction: -1 | 1) => {
    const root = strip.current;
    if (!root) return;
    root.scrollBy({
      left:
        direction *
        Math.max(
          root.clientWidth * 0.8,
          root.firstElementChild?.getBoundingClientRect().width ?? 0,
        ),
      behavior: reduced ? 'instant' : 'smooth',
    });
  };
  return (
    <div
      ref={container}
      className={styles.carousel}
      data-overflow={bounds.overflow}
      data-stop-carousel
    >
      <button
        type="button"
        className={`${styles.carouselArrow} ${styles.previous}`}
        aria-label={t('ui.earlierDestinations')}
        hidden={!bounds.overflow}
        disabled={!bounds.previous}
        onClick={() => slide(-1)}
      >
        <Icon name="collapse" />
      </button>
      <div
        ref={strip}
        className={styles.stops}
        role="group"
        aria-label={t('ui.chooseCity')}
        onBlur={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget) &&
            !(
              event.relatedTarget instanceof Element &&
              event.relatedTarget.closest('[data-city-bubble]')
            )
          )
            onBlur?.();
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-id]'),
          );
          const current = buttons.indexOf(event.target as HTMLButtonElement);
          if (current < 0) return;
          event.preventDefault();
          const index =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : Math.max(
                    0,
                    Math.min(buttons.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1)),
                  );
          const target = buttons[index];
          if (!target) return;
          target.focus({ preventScroll: true });
          const box = event.currentTarget.getBoundingClientRect(),
            point = target.getBoundingClientRect();
          event.currentTarget.scrollBy({
            left:
              point.left < box.left
                ? point.left - box.left
                : point.right > box.right
                  ? point.right - box.right
                  : 0,
            behavior: reduced ? 'instant' : 'smooth',
          });
        }}
      >
        {items.map((entry) => (
          <button
            type="button"
            className={`${styles.stop} ${selectedId === entry.id ? styles.active : ''}`}
            key={entry.id}
            data-id={entry.id}
            aria-label={t('ui.exploreCity', { city: entry.city, company: entry.organizationName })}
            aria-pressed={selectedId === entry.id}
            onClick={(event) =>
              onSelect(
                entry.id,
                event.detail === 0 ||
                  (event.nativeEvent as PointerEvent).pointerType === 'touch' ||
                  matchMedia('(hover: none)').matches,
              )
            }
          >
            <span className={styles.stopYear}>{periodLabels(entry, locale, dateCopy(t)).year}</span>
            <strong>{entry.city}</strong>
            <span className={styles.stopCode}>{entry.organizationCode}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`${styles.carouselArrow} ${styles.next}`}
        aria-label={t('ui.laterDestinations')}
        hidden={!bounds.overflow}
        disabled={!bounds.next}
        onClick={() => slide(1)}
      >
        <Icon name="collapse" />
      </button>
    </div>
  );
}
