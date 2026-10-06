import { useSyncExternalStore } from 'react';

/** Subscribe to document visibility so animation loops stop rather than spin while hidden. */
export function useDocumentVisible() {
  const subscribe = (notify: () => void) => {
    document.addEventListener('visibilitychange', notify);
    return () => document.removeEventListener('visibilitychange', notify);
  };
  return useSyncExternalStore(
    subscribe,
    () => !document.hidden,
    () => true,
  );
}
