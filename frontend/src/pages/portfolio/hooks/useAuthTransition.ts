import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  authTransitionImmediateStyle,
  authTransitionStyle,
  createAuthTransition,
  type AuthTransitionPhase,
} from '../model/auth-transition';

/**
 * Coordinate the page-owned login frame while preserving the portfolio's saved scroll position.
 * The owner publishes phase/view/style on the frame and keeps both page surfaces mounted.
 * Hidden documents finish the transition separately; disposal clears its clock, listener and frame.
 * @param skipMotion Skip the entrance animation, currently supplied by the reduced-motion preference.
 */
export function useAuthTransition(skipMotion: boolean) {
  const [phase, setPhase] = useState<AuthTransitionPhase>('portfolio');
  const controller = useRef<ReturnType<typeof createAuthTransition> | null>(null);
  const motion = useRef(skipMotion);
  const scroll = useRef({ x: 0, y: 0 });
  const restoreFrame = useRef(0);

  useEffect(() => {
    const player = createAuthTransition((next) => {
      setPhase(next);
      // The fading portfolio retains its geometry until the rail has cleared.
      if (next === 'collide' || next === 'auth')
        window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    });
    controller.current = player;
    const visibility = () => {
      if (document.hidden) player.finish();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      player.dispose();
      controller.current = null;
      cancelAnimationFrame(restoreFrame.current);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => {
    motion.current = skipMotion;
    if (skipMotion) controller.current?.finish();
  }, [skipMotion]);

  const open = useCallback(() => {
    const player = controller.current;
    if (!player || player.getPhase() !== 'portfolio') return;
    cancelAnimationFrame(restoreFrame.current);
    scroll.current = { x: window.scrollX, y: window.scrollY };
    player.open(motion.current || document.hidden);
  }, []);

  const back = useCallback(() => {
    if (!controller.current?.back()) return;
    cancelAnimationFrame(restoreFrame.current);
    // Wait for the portfolio layout to return before restoring its saved position.
    restoreFrame.current = requestAnimationFrame(() => {
      restoreFrame.current = 0;
      window.scrollTo({ left: scroll.current.x, top: scroll.current.y, behavior: 'instant' });
    });
  }, []);

  return {
    phase,
    isAuth: phase !== 'portfolio',
    busy: phase !== 'portfolio' && phase !== 'auth',
    style: (skipMotion ? authTransitionImmediateStyle : authTransitionStyle) as CSSProperties,
    open,
    back,
  };
}
