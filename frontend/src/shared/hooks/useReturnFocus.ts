import { useCallback, useEffect, useRef } from 'react';

/** Restore a dialog's activating control after its descendants release focus.
 * @param open Owning component's controlled dialog state, including lazy loading.
 * @returns A stable callback that captures the activating event's currentTarget.
 * Capture precedes asynchronous imports; closing schedules focus after modal cleanup.
 * Removed controls and pending frames are ignored when the owner changes or unmounts.
 * Explicit focus moves, Bootstrap restoration and focus outside an iframe take precedence.
 */
export function useReturnFocus(open: boolean) {
  const trigger = useRef<HTMLElement | undefined>(undefined);
  const remember = useCallback((element: HTMLElement) => {
    trigger.current = element;
  }, []);

  useEffect(() => {
    if (open || !trigger.current) return;
    const element = trigger.current;
    trigger.current = undefined;
    const document = element.ownerDocument;
    const closingFocus = document.activeElement;
    const frame = requestAnimationFrame(() => {
      // Bootstrap can already restore the trigger before this frame. Do not focus
      // it twice or pull focus back from a parent iframe/control chosen meanwhile.
      if (
        document.activeElement === element ||
        (document.activeElement !== closingFocus && document.activeElement !== document.body) ||
        !document.hasFocus()
      )
        return;
      if (element.isConnected && !element.matches(':disabled') && !element.closest('[inert]')) {
        element.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return remember;
}
