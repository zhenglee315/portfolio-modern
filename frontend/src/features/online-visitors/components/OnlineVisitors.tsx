import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/shared/ui/Icon';
import { PixelBubble } from '@/shared/ui/PixelBubble';
import { useAnchoredPanel } from '@/shared/hooks/useAnchoredPanel';
import { mobileQuery, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import type { OnlineVisitors as OnlineVisitorsData } from '../schemas/online-visitors';
import styles from './OnlineVisitors.module.css';

/** Position a passive tooltip beside the desktop trigger, using the shared pixel shell.
 * @param props Owning trigger, panel ref, localized text and pointer lifecycle callbacks.
 * @returns A body portal whose shared placement hook releases observers on unmount.
 * Only the open tooltip mounts this hook; collapsed/hidden panels allocate no observers.
 * Mobile follows chat's above placement so longer translated copy cannot cover its trigger.
 */
function OnlineVisitorsTooltip({
  anchor,
  panel,
  id,
  text,
  onEnter,
  onLeave,
}: {
  anchor: HTMLButtonElement;
  panel: RefObject<HTMLDivElement | null>;
  id: string;
  text: string;
  onEnter: (event: { pointerType: string }) => void;
  onLeave: (event: { pointerType: string }) => void;
}) {
  const mobile = useMediaQuery(mobileQuery);
  useAnchoredPanel(panel, anchor, undefined, undefined, mobile ? 'above' : 'side');
  return createPortal(
    <PixelBubble
      ref={panel}
      id={id}
      role="tooltip"
      className={styles.tooltip}
      data-online-tooltip
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      {text}
    </PixelBubble>,
    document.body,
  );
}

/** Present the same compact silhouette/count in expanded rails, compact rails and drawers.
 * @param props Validated query data and failure state supplied by the composing navigation.
 * @returns A localized count and hover/focus/tap tooltip; a dash denotes missing initial data.
 * Owns only disclosure state, not requests. A short leave delay bridges the pixel tail's gap.
 * Escape, outside clicks, blur, scrolling and hidden documents dismiss; listeners/timers clean up.
 * Failed refreshes preserve the count and describe it as stale in both accessible and visible copy.
 */
export function OnlineVisitors({ data, failed }: { data?: OnlineVisitorsData; failed: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const open = anchor !== null;
  const close = useCallback(() => {
    clearTimeout(closeTimer.current);
    setAnchor(null);
  }, []);
  const show = useCallback(() => {
    clearTimeout(closeTimer.current);
    setAnchor(trigger.current);
  }, []);
  const enter = (event: { pointerType: string }) => {
    if (event.pointerType !== 'touch') show();
  };
  const leave = (event: { pointerType: string }) => {
    if (event.pointerType === 'touch' || trigger.current?.matches(':focus-visible')) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(close, 150);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !trigger.current?.contains(event.target) &&
        !panel.current?.contains(event.target)
      )
        close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    const hidden = () => {
      if (document.hidden) close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open, close]);
  const label = data
    ? t(failed ? 'ui.onlineVisitorsStale' : 'ui.onlineVisitors', { count: data.online })
    : t(failed ? 'ui.onlineVisitorsUnavailable' : 'ui.onlineVisitorsLoading');
  const text = data && !failed ? t('ui.onlineVisitorsNow', { count: data.online }) : label;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.indicator}
        aria-label={label}
        aria-describedby={open ? id : undefined}
        data-online-visitors
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) show();
        }}
        onBlur={() => {
          if (!trigger.current?.matches(':hover') && !panel.current?.matches(':hover')) close();
        }}
        onClick={show}
      >
        <Icon name="personHearts" highlight />
        <span className={styles.count} aria-hidden="true" data-online-count>
          {data?.online ?? '—'}
        </span>
      </button>
      {anchor && (
        <OnlineVisitorsTooltip
          anchor={anchor}
          panel={panel}
          id={id}
          text={text}
          onEnter={enter}
          onLeave={leave}
        />
      )}
    </>
  );
}
