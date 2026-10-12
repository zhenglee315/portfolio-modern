import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  authTransitionImmediateStyle,
  authTransitionStyle,
  createAuthTransition,
  type AuthTransitionPhase,
} from '@/shared/lib/auth-transition';

/** Reuse the finite ruler entrance; the caller supplies effective motion suspension. */
export function useAccessDeniedEntrance(motionPaused: boolean) {
  // Keep server-rendered content readable before the client starts the entrance.
  const [phase, setPhase] = useState<AuthTransitionPhase>('portfolio');
  const controller = useRef<ReturnType<typeof createAuthTransition> | null>(null);
  const paused = useRef(motionPaused);

  useEffect(() => {
    const player = createAuthTransition(setPhase);
    controller.current = player;
    const visibility = () => {
      if (document.hidden) player.finish();
    };
    document.addEventListener('visibilitychange', visibility);
    player.open(paused.current || document.hidden);
    return () => {
      player.dispose();
      controller.current = null;
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => {
    paused.current = motionPaused;
    if (motionPaused) controller.current?.finish();
  }, [motionPaused]);

  return {
    phase,
    style: (motionPaused ? authTransitionImmediateStyle : authTransitionStyle) as CSSProperties,
  };
}
