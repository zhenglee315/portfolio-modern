import { useEffect, type RefObject } from 'react';

/**
 * Subscribe only while a tooltip has an anchor; opening and hover timing remain owner-controlled.
 * Anchor and panel are protected from outside pointer dismissal, including portaled panels.
 * Escape dismisses only this description without moving focus or closing its surrounding dialog.
 * Capture-phase scroll includes nested rails. Hide/blur/resize prevent stale floating descriptions.
 * Every listener is removed on close, anchor replacement or unmount; keep onClose stable.
 */
export function useTooltipDismissal(
  anchor: Element | null,
  panel: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!anchor) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !anchor.contains(event.target) &&
        !panel.current?.contains(event.target)
      )
        onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    const hidden = () => {
      if (document.hidden) onClose();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [anchor, panel, onClose]);
}
