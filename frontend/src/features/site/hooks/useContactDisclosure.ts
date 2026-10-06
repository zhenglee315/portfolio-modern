import { useCallback, useEffect, useReducer, useRef, useState, type MouseEvent } from 'react';
import { reducedMotionQuery, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import {
  contactAnchor,
  contactKeyboardFocused,
  contactReducer,
  contactSurfaceSelector,
  contactTiming,
  initialContact,
} from '../model/contact';

/** Own a single responsive disclosure and bounded idle timers, independent of animation settings. */
export function useContactDisclosure() {
  const [state, dispatch] = useReducer(contactReducer, initialContact);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const reduced = useMediaQuery(reducedMotionQuery);
  const touched = useRef(false),
    revealed = useRef(false);
  const close = useCallback(
    (restore = true) => {
      dispatch({ type: 'close' });
      if (restore) (contactAnchor() ?? anchor)?.focus({ preventScroll: true });
    },
    [anchor],
  );
  /** Restore only focus removed with the disclosure; leave unrelated page controls untouched. */
  const expire = useCallback(
    () => close(!!document.activeElement?.closest(contactSurfaceSelector)),
    [close],
  );
  /** Prioritize another explicit page control without restoring contact-trigger focus.
   * @returns Nothing; subsequent automatic offers are suppressed while manual contact stays available.
   */
  const dismiss = useCallback(() => {
    touched.current = true;
    dispatch({ type: 'close' });
  }, []);
  /** Start visible-copy timing after the lazy surface mounts; a failed enhancement skips entrance. */
  const present = useCallback((animate = true) => {
    // A replaced loading fallback may unmount without leave/blur events; read the new surface.
    const hovered =
      window.matchMedia('(hover: hover)').matches &&
      Array.from(document.querySelectorAll(contactSurfaceSelector)).some((node) =>
        node.matches(':hover'),
      );
    dispatch({ type: 'present', animate, hovered, focused: contactKeyboardFocused() });
  }, []);
  /** Release the automatic introduction before starting its full idle interval.
   * Manual disclosures skip entrance; reduced motion skips its visual delay.
   */
  useEffect(() => {
    if (!state.open || !state.presented || !state.appearing) return;
    if (reduced) {
      dispatch({ type: 'appeared' });
      return;
    }
    const appear = setTimeout(() => dispatch({ type: 'appeared' }), contactTiming.fadeMs);
    return () => clearTimeout(appear);
  }, [state.open, state.presented, state.appearing, reduced]);
  useEffect(() => {
    if (
      !state.open ||
      !state.presented ||
      state.appearing ||
      state.fading ||
      state.hovered ||
      state.focused
    )
      return;
    const idle = setTimeout(() => {
      // Input modality may change without moving focus; verify its current paint at the deadline.
      if (contactKeyboardFocused()) {
        dispatch({ type: 'focus', active: true });
        return;
      }
      if (reduced) expire();
      else dispatch({ type: 'fade' });
    }, contactTiming.idleMs);
    return () => clearTimeout(idle);
  }, [
    state.open,
    state.presented,
    state.appearing,
    state.fading,
    state.hovered,
    state.focused,
    reduced,
    expire,
  ]);
  /** Give fade its own cleanup so trigger/hover rescue can cancel it and start a fresh idle interval. */
  useEffect(() => {
    if (!state.open || !state.fading) return;
    if (reduced) {
      expire();
      return;
    }
    const fade = setTimeout(expire, contactTiming.fadeMs);
    return () => clearTimeout(fade);
  }, [state.open, state.fading, reduced, expire]);
  useEffect(() => {
    if (!state.open) return;
    const resize = () => setAnchor(contactAnchor());
    /** Only visible keyboard focus inside the copy suspends inactivity; pointer focus does not. */
    const focus = () => {
      dispatch({ type: 'focus', active: contactKeyboardFocused() });
    };
    // Completed keyboard/pointer gestures also reconcile modality on an already-focused element.
    const focusEvents = ['focusin', 'focusout', 'keyup', 'pointerup'] as const;
    window.addEventListener('resize', resize);
    for (const event of focusEvents) document.addEventListener(event, focus);
    focus();
    return () => {
      window.removeEventListener('resize', resize);
      for (const event of focusEvents) document.removeEventListener(event, focus);
    };
  }, [state.open]);
  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    touched.current = true;
    setAnchor(event.currentTarget);
    if (state.open && !state.fading) close(false);
    else dispatch({ type: 'open' });
  };
  const reveal = useCallback(() => {
    if (touched.current || revealed.current) return;
    const next = contactAnchor();
    if (!next) return;
    revealed.current = true;
    setAnchor(next);
    dispatch({ type: 'open', appearing: true });
  }, []);
  return {
    state,
    anchor,
    toggle,
    close,
    dismiss,
    present,
    reveal,
    hover: (active: boolean) => dispatch({ type: 'hover', active }),
  };
}
export type ContactDisclosure = ReturnType<typeof useContactDisclosure>;
