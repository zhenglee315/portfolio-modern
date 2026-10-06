import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { pageSize } from '@/shared/schemas/records';
import { LoadMoreControl } from './LoadMoreControl';
import { Icon } from './Icon';
import styles from './ExpandableCollection.module.css';

type Props<T> = {
  items: T[];
  total: number;
  hasMore: boolean;
  busy: boolean;
  error?: string;
  copy: { more: string; less: string; load: string; loading: string };
  onLoadMore: () => void;
  renderItems: (items: T[]) => ReactNode;
  className?: string;
};

/** Share the first-page preview, lazy continuation and cache-preserving collapse.
 * The feature passes validated records and owns fetching; hidden extra DOM is unmounted.
 */
export function ExpandableCollection<T>({
  items,
  total,
  hasMore,
  busy,
  error,
  copy,
  onLoadMore,
  renderItems,
  className = '',
}: Props<T>) {
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const focusExtra = useRef(false);
  const restoreTrigger = useRef(false);
  const id = useId();
  const more = total > pageSize;
  // Keyboard disclosure moves into newly available content after the request settles.
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    focusExtra.current = event.detail === 0;
    setExpanded(true);
    if (items.length <= pageSize && hasMore && !busy && !error) onLoadMore();
  };
  const collapse = () => {
    restoreTrigger.current = true;
    setExpanded(false);
  };
  useEffect(() => {
    if (!expanded && restoreTrigger.current) {
      restoreTrigger.current = false;
      trigger.current?.focus({ preventScroll: true });
      trigger.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
    } else if (
      expanded &&
      focusExtra.current &&
      !busy &&
      (items.length > pageSize || error || !hasMore)
    ) {
      focusExtra.current = false;
      const first = content.current?.querySelector<HTMLElement>(
        'button:not(:disabled), a[href], [tabindex="0"]',
      );
      (first ?? content.current)?.focus({ preventScroll: true });
    }
  }, [expanded, busy, items.length, error, hasMore]);
  return (
    <>
      {renderItems(items.slice(0, pageSize))}
      {more && (
        <div className={`${styles.disclosure} ${className}`}>
          <button
            ref={trigger}
            type="button"
            className={styles.summary}
            aria-expanded={expanded}
            aria-controls={id}
            hidden={expanded}
            onClick={open}
          >
            <span>
              {copy.more} <small>{total - pageSize}</small>
            </span>
            <Icon name="plusCircle" pulse="disclosure" />
          </button>
          {expanded && (
            <div ref={content} id={id} className={styles.content} tabIndex={-1}>
              {renderItems(items.slice(pageSize))}
              {hasMore && (
                <LoadMoreControl
                  busy={busy}
                  label={copy.load}
                  busyLabel={copy.loading}
                  error={error}
                  onLoad={onLoadMore}
                />
              )}
              {!hasMore && error && <p role="alert">{error}</p>}
              <button type="button" className={styles.collapse} onClick={collapse}>
                {copy.less}
                <Icon name="arrowUp" />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
