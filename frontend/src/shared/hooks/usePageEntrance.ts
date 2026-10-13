import { useEffect, useRef, type RefObject } from 'react';
import { createEntrance, entranceTiming } from '@/shared/lib/entrance';

/** Reuse one finite entrance for initial hydration and completed palette transitions.
 * @param root Page surface; SSR and documents without JavaScript retain normal visibility.
 * @param options Owner-injected motion policy, palette subscription and optional one-shot ready callback.
 * Theme preparation holds the original CSS until reveal completes; replay never repeats the callback.
 * Cleanup unsubscribes and releases only this page's marker and pending deadline.
 */
export function usePageEntrance(
  root: RefObject<HTMLDivElement | null>,
  {
    ready = true,
    onReady,
    paused,
    subscribe,
    enabled = true,
  }: {
    ready?: boolean;
    onReady?: () => void;
    paused: boolean;
    subscribe: (listener: (phase: 'prepare' | 'replay' | 'cancel') => void) => () => void;
    enabled?: boolean;
  },
) {
  const complete = useRef(false);
  const offered = useRef(false);
  const deadline = useRef<number | null>(null);
  const callback = useRef({ ready, onReady });
  const controller = useRef<ReturnType<typeof createEntrance> | null>(null);
  const replaying = useRef(false);

  // Owner readiness arriving later must not replay the frame or delay the navigation.
  useEffect(() => {
    callback.current = { ready, onReady };
    if (enabled && complete.current && ready && !offered.current) {
      offered.current = true;
      onReady?.();
    }
  }, [ready, onReady, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const surface = root.current;
    if (!surface) return;
    const player = createEntrance(surface);
    controller.current = player;
    const unsubscribe = subscribe((phase) => {
      if (phase === 'prepare') {
        // Replace unfinished startup without repeating the owner's one-shot callback.
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
    /** Release finite visual preparation before notifying an independently ready owner. */
    const finish = () => {
      complete.current = true;
      if (callback.current.ready && !offered.current) {
        offered.current = true;
        callback.current.onReady?.();
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
