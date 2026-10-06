import { useCallback, useEffect, useRef } from 'react';
import type { Theme } from '../model/preferences';
import { createThemeTransition, type ThemeTransitionPhase } from '../model/transition';
import styles from '../components/ThemeTransition.module.css';

/** Bind one palette controller to provider lifetime and synchronous page-owned entrance listeners.
 * @param theme Validated preference; restored first paint and identical selections remain immediate.
 * @param reduced Accessibility policy that cancels both the veil and any continuing page replay.
 * @param visible Hidden documents finish visual work immediately without replaying on return.
 * @returns Stable subscription function; each page removes its listener on unmount.
 */
export function useThemeTransition(theme: Theme, reduced: boolean, visible: boolean) {
  const controller = useRef<ReturnType<typeof createThemeTransition> | null>(null);
  const listeners = useRef(new Set<(phase: ThemeTransitionPhase) => void>());
  const subscribeThemeTransition = useCallback(
    (listener: (phase: ThemeTransitionPhase) => void) => {
      listeners.current.add(listener);
      return () => {
        listeners.current.delete(listener);
      };
    },
    [],
  );
  // Dispatch synchronously under the opaque cover instead of waiting for another React render.
  const notify = useCallback((phase: ThemeTransitionPhase) => {
    for (const listener of [...listeners.current]) listener(phase);
  }, []);
  useEffect(() => {
    const next = createThemeTransition(document, styles.veil!, notify);
    controller.current = next;
    return () => {
      next.dispose();
      controller.current = null;
    };
  }, [notify]);
  useEffect(() => {
    controller.current?.apply(theme, !reduced && visible);
  }, [theme, reduced, visible]);
  return subscribeThemeTransition;
}
