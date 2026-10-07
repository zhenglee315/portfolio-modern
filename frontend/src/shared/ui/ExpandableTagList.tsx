import { useEffect, useId, useRef, useState } from 'react';
import { tagPreviewCount } from '@/shared/lib/tag-layout';
import { pageSize } from '@/shared/schemas/records';
import { LoadMoreControl } from './LoadMoreControl';
import { Icon } from './Icon';
import styles from './ExpandableTagList.module.css';

export type TagCopy = {
  more: (count: number) => string;
  compact: (count: number) => string;
  less: string;
  lessLabel: string;
  load: string;
  loading: string;
};
type Props = {
  items: { id: string | number; label: string }[];
  total?: number;
  hasMore?: boolean;
  busy?: boolean;
  error?: string;
  copy: TagCopy;
  onLoadMore?: () => void;
  onPreviewMore?: () => void;
};

/** Share measured skill disclosure for complete card tags and paginated category tags.
 * @param props Ordered labels, real owner total and optional domain continuation callback.
 * Resize/font observers measure the same localized labels in inert replicas; no API is owned.
 * An optional preview callback fills remaining width from a paginated owner without expanding it.
 * Collapsed live plus icons reuse Icon's disclosure breathing; measurement copies remain static.
 */
export function ExpandableTagList({
  items,
  total = items.length,
  hasMore = false,
  busy = false,
  error,
  copy,
  onLoadMore,
  onPreviewMore,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [layout, setLayout] = useState({
    count: Math.min(2, items.length),
    measuredItems: null as Props['items'] | null,
    measuredTotal: total,
    needsMore: false,
  });
  const { count } = layout;
  const root = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    let frame = 0,
      stopped = false;
    const update = () => {
      frame = 0;
      if (!root.current || !measure.current || stopped) return;
      const widths = Array.from(measure.current.querySelectorAll<HTMLElement>('[data-tag]')).map(
        (element) => element.getBoundingClientRect().width,
      );
      const toggles = new Map(
        Array.from(measure.current.querySelectorAll<HTMLElement>('[data-count]')).map((element) => [
          Number(element.dataset.count),
          element.getBoundingClientRect().width,
        ]),
      );
      const gap = Number.parseFloat(getComputedStyle(root.current).columnGap) || 7;
      const available = root.current.getBoundingClientRect().width;
      const visible = tagPreviewCount(
        widths,
        total,
        available,
        gap,
        (hidden) => toggles.get(hidden) ?? 44,
      );
      // Stamp the input references so an arriving page is measured before requesting another.
      setLayout({
        count: visible,
        measuredItems: items,
        measuredTotal: total,
        needsMore: available > 0 && visible === items.length && items.length < total,
      });
    };
    const schedule = () => {
      if (!frame && !stopped) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    if (root.current) observer.observe(root.current);
    schedule();
    void document.fonts?.ready.then(schedule);
    return () => {
      stopped = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [items, total, copy]);
  useEffect(() => {
    if (
      !expanded &&
      hasMore &&
      !busy &&
      !error &&
      layout.measuredItems === items &&
      layout.measuredTotal === total &&
      layout.needsMore
    )
      onPreviewMore?.();
  }, [expanded, hasMore, busy, error, layout, items, total, onPreviewMore]);
  if (!total) return null;
  const hidden = total - count;
  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    // A first-page owner can start continuation; already loaded history stays cache-owned.
    if (next && hasMore && items.length <= pageSize && !busy && !error) onLoadMore?.();
  };
  return (
    <div className={styles.wrapper}>
      <div ref={root} className={`${styles.tags} tag-list`} id={id}>
        {(expanded ? items : items.slice(0, count)).map((item) => (
          <span className={styles.tag} key={item.id}>
            {item.label}
          </span>
        ))}
        {(hidden > 0 || expanded) && (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={expanded}
            aria-controls={id}
            aria-label={expanded ? copy.lessLabel : copy.more(hidden)}
            onClick={toggle}
          >
            <Icon name={expanded ? 'minus' : 'plus'} pulse={expanded ? undefined : 'disclosure'} />
            {expanded ? copy.less : copy.compact(hidden)}
          </button>
        )}
      </div>
      {expanded && hasMore && onLoadMore && (
        <LoadMoreControl
          busy={busy}
          label={copy.load}
          busyLabel={copy.loading}
          error={error}
          onLoad={onLoadMore}
        />
      )}
      {expanded && !hasMore && error && <p role="alert">{error}</p>}
      <div className={`${styles.measure} ${styles.tags}`} ref={measure} aria-hidden="true" inert>
        {items.map((item) => (
          <span data-tag className={styles.tag} key={item.id}>
            {item.label}
          </span>
        ))}
        {Array.from({ length: items.length + 1 }, (_, index) => total - index)
          .filter((value) => value > 0)
          .map((value) => (
            <span className={styles.toggle} data-count={value} key={value}>
              <Icon name="plus" />
              {copy.compact(value)}
            </span>
          ))}
      </div>
    </div>
  );
}
