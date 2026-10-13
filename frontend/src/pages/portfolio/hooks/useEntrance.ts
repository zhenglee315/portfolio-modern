import type { RefObject } from 'react';
import type { ThemeTransitionPhase } from '@/features/appearance';
import { usePageEntrance } from '@/shared/hooks/usePageEntrance';

/** Supply the public page's one-shot contact disclosure to the shared visual lifecycle. */
export function useEntrance(
  root: RefObject<HTMLDivElement | null>,
  ready: boolean,
  reveal: () => void,
  paused: boolean,
  subscribe: (listener: (phase: ThemeTransitionPhase) => void) => () => void,
  enabled = true,
) {
  usePageEntrance(root, { ready, onReady: reveal, paused, subscribe, enabled });
}
