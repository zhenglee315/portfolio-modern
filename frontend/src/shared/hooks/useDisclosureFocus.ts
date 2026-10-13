import { useEffect, type RefObject } from 'react';

/** Share initial focus and outside-focus dismissal for nonmodal disclosures.
 * @param open Owning component's controlled disclosure state.
 * @param surface Stable ref containing both the trigger and disclosure controls.
 * @param initial Stable ref to the owning disclosure's first or selected control.
 * @param onClose Stable callback; the owner retains toggle, Escape and focus-restoration policy.
 * @param activationKey Optional panel identity; changing views restarts initial focus safely.
 * Scheduled focus preserves any focus change made after opening. The frame and document
 * listener are released when closed or unmounted.
 */
export function useDisclosureFocus(
  open: boolean,
  surface: RefObject<HTMLElement | null>,
  initial: RefObject<HTMLElement | null>,
  onClose: () => void,
  activationKey?: string | null,
) {
  useEffect(() => {
    if (!open) return;
    const openingFocus = document.activeElement;
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === openingFocus) initial.current?.focus();
    });
    const closeOnBlur = (event: FocusEvent) => {
      if (event.target instanceof Node && !surface.current?.contains(event.target)) onClose();
    };
    document.addEventListener('focusin', closeOnBlur);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('focusin', closeOnBlur);
    };
  }, [open, surface, initial, onClose, activationKey]);
}
