import { useEffect, useRef, type RefObject } from 'react';

/** Coordinate one finite entrance without waiting for optional decoration or API chunks.
 * @param root Page surface; SSR and documents without JavaScript retain normal visibility.
 * @param ready Whether validated contact content is available.
 * @param reveal One-shot contact callback that respects earlier manual interaction.
 * @param paused Effective motion policy; suspension immediately completes the entrance.
 * @returns Nothing. Cleanup removes only this page's marker and pending deadline.
 */
export function useEntrance(
  root: RefObject<HTMLDivElement | null>,
  ready: boolean,
  reveal: () => void,
  paused: boolean,
) {
  const complete = useRef(false);
  const deadline = useRef<number | null>(null);
  const contact = useRef({ ready, reveal });

  // Contact data arriving later must not replay the frame or delay the navigation.
  useEffect(() => {
    contact.current = { ready, reveal };
    if (complete.current && ready) reveal();
  }, [ready, reveal]);

  useEffect(() => {
    const surface = root.current;
    if (!surface || complete.current) return;
    /** Release finite visual preparation before offering the independent contact disclosure. */
    const finish = () => {
      surface.removeAttribute('data-entering');
      complete.current = true;
      if (contact.current.ready) contact.current.reveal();
    };
    if (paused) {
      finish();
      return;
    }
    // Preserve the first deadline across React effect checks instead of restarting 1400ms.
    deadline.current ??= performance.now() + 1400;
    const remaining = Math.max(0, deadline.current - performance.now());
    surface.setAttribute('data-entering', 'true');
    const timer = setTimeout(finish, remaining);
    return () => {
      clearTimeout(timer);
      surface.removeAttribute('data-entering');
    };
  }, [root, paused]);
}
