import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const browserSnapshot = () => true;
const serverSnapshot = () => false;

/** Keep SSR and the first hydration render identical before enabling browser-only state. */
export function useHydrated() {
  return useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
}
