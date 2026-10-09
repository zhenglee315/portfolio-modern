import { useEffect, useRef, type RefObject } from 'react';
import type { ThemeTransitionPhase } from '@/features/appearance';
import { createEntrance, entranceTiming } from '../model/entrance';

/** Reuse one finite entrance for initial hydration and completed palette transitions.
 * @param root Page surface; SSR and documents without JavaScript retain normal visibility.
 * @param ready Whether validated contact content is available.
 * @param reveal One-shot contact callback that respects earlier manual interaction.
 * @param paused Initial motion policy; suspension immediately completes startup.
 * @param subscribe Stable appearance lifecycle subscription, independent of page DOM ownership.
 * @param enabled Bind visual work and contact offers only while the portfolio is visible.
 * Theme preparation holds the original CSS until reveal completes; replay never offers contact.
 * Cleanup unsubscribes and releases only this page's marker and pending deadline.
 */
export function useEntrance(
  root: RefObject<HTMLDivElement | null>,
  ready: boolean,
  reveal: () => void,
  paused: boolean,
  subscribe: (listener: (phase: ThemeTransitionPhase) => void) => () => void,
  enabled = true,
) {
  const complete = useRef(false);
  const offered = useRef(false);
  const deadline = useRef<number | null>(null);
  const contact = useRef({ ready, reveal });
  const controller = useRef<ReturnType<typeof createEntrance> | null>(null);
  const replaying = useRef(false);

  // Contact data arriving later must not replay the frame or delay the navigation.
  useEffect(() => {
    contact.current = { ready, reveal };
    if (enabled && complete.current && ready && !offered.current) {
      offered.current = true;
      reveal();
    }
  }, [ready, reveal, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const surface = root.current;
    if (!surface) return;
    const player = createEntrance(surface);
    controller.current = player;
    const unsubscribe = subscribe((phase) => {
      if (phase === 'prepare') {
        // Replace any unfinished startup without turning a palette action into another chat offer.
        complete.current = true;
        replaying.current = true;
        player.prepare();
      } else if (phase === 'replay' && replaying.current) {
        player.play(() => {
          replaying.current = false;
        });
      } else if (phase === 'cancel' && replaying.current) {
        replaying.current = false;
        player.cancel();
      }
    });
    return () => {
      unsubscribe();
      player.dispose();
      controller.current = null;
      replaying.current = false;
    };
  }, [root, subscribe, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const player = controller.current;
    if (!player || complete.current || replaying.current) return;
    /** Release finite visual preparation before offering the independent contact disclosure. */
    const finish = () => {
      complete.current = true;
      if (contact.current.ready && !offered.current) {
        offered.current = true;
        contact.current.reveal();
      }
    };
    if (paused) {
      player.cancel();
      finish();
      return;
    }
    // Preserve the first deadline across React effect checks instead of restarting 1400ms.
    deadline.current ??= performance.now() + entranceTiming.durationMs;
    const remaining = Math.max(0, deadline.current - performance.now());
    player.prepare();
    player.play(finish, remaining);
    return () => {
      if (!replaying.current) player.cancel();
    };
  }, [root, paused, subscribe, enabled]);
}
