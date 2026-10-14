import { useCallback, useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { useTooltipDismissal } from './useTooltipDismissal';

/**
 * Share non-touch hover and visible-focus disclosure while the owning button keeps its action.
 * Spread triggerProps on the button and mount a tooltip only when tooltipProps is present.
 * A 150 ms leave delay bridges the button and portal; close cancels that pending timer.
 * Global dismissal listeners exist only while open; effects remove listeners and clear timers.
 */
export function useHoverTooltip() {
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
  const enter = useCallback(
    (event: { pointerType: string }) => {
      if (event.pointerType !== 'touch') show();
    },
    [show],
  );
  const leave = useCallback(
    (event: { pointerType: string }) => {
      if (event.pointerType === 'touch' || trigger.current?.matches(':focus-visible')) return;
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(close, 150);
    },
    [close],
  );
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useTooltipDismissal(anchor, panel, close);

  return {
    show,
    close,
    triggerProps: {
      ref: trigger,
      'aria-describedby': open ? id : undefined,
      onPointerEnter: enter,
      onPointerLeave: leave,
      onFocus: (event: FocusEvent<HTMLButtonElement>) => {
        if (event.currentTarget.matches(':focus-visible')) show();
      },
      onBlur: () => {
        if (!trigger.current?.matches(':hover') && !panel.current?.matches(':hover')) close();
      },
    },
    tooltipProps: anchor
      ? { anchor, panel, id, onPointerEnter: enter, onPointerLeave: leave }
      : null,
  };
}
