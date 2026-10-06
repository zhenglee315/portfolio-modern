import { useCallback, useSyncExternalStore } from 'react';

export const mobileQuery = '(max-width: 760px)';
export const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

/** Subscribe to browser media preferences with deterministic build-time defaults.
 * @param query Shared CSS-compatible condition; listeners are removed on unmount.
 */
export function useMediaQuery(query: string, serverValue = false) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', notify);
      return () => media.removeEventListener('change', notify);
    },
    [query],
  );
  const snapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, snapshot, () => serverValue);
}
