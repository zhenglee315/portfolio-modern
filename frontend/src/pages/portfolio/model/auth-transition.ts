export type AuthTransitionPhase = 'portfolio' | 'exit' | 'collide' | 'expand' | 'reveal' | 'auth';

/** One clock supplies both the finite controller and the page's CSS duration properties. */
export const authTransitionTiming = {
  exit: 260,
  collide: 300,
  expand: 350,
  reveal: 420,
} as const;

export const authTransitionStyle = {
  '--auth-exit-duration': `${authTransitionTiming.exit}ms`,
  '--auth-collide-duration': `${authTransitionTiming.collide}ms`,
  '--auth-expand-duration': `${authTransitionTiming.expand}ms`,
  '--auth-reveal-duration': `${authTransitionTiming.reveal}ms`,
} as const;

export const authTransitionImmediateStyle = {
  '--auth-exit-duration': '0ms',
  '--auth-collide-duration': '0ms',
  '--auth-expand-duration': '0ms',
  '--auth-reveal-duration': '0ms',
} as const;

const nextPhase = {
  exit: 'collide',
  collide: 'expand',
  expand: 'reveal',
  reveal: 'auth',
} as const;

/** Own one login sequence; replacement, interruption and disposal invalidate older deadlines.
 * @param onPhase Page callback that publishes the new phase to its existing frame.
 * Opening is locked until the owner returns to the portfolio. Motion suspension settles auth.
 */
export function createAuthTransition(onPhase: (phase: AuthTransitionPhase) => void) {
  let phase: AuthTransitionPhase = 'portfolio';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let disposed = false;

  const clear = () => {
    generation++;
    clearTimeout(timer);
    timer = undefined;
  };

  const advance = (value: AuthTransitionPhase) => {
    const ticket = generation;
    phase = value;
    onPhase(value);
    if (disposed || ticket !== generation || value === 'portfolio' || value === 'auth') return;
    timer = setTimeout(() => {
      if (disposed || ticket !== generation) return;
      timer = undefined;
      advance(nextPhase[value]);
    }, authTransitionTiming[value]);
  };

  const open = (skipMotion = false) => {
    if (disposed || phase !== 'portfolio') return false;
    clear();
    advance(skipMotion ? 'auth' : 'exit');
    return true;
  };

  const back = () => {
    if (disposed || phase === 'portfolio') return false;
    clear();
    advance('portfolio');
    return true;
  };

  const finish = () => {
    if (disposed || phase === 'portfolio' || phase === 'auth') return;
    clear();
    advance('auth');
  };

  const dispose = () => {
    if (disposed) return;
    clear();
    disposed = true;
  };

  return { open, back, finish, dispose, getPhase: () => phase };
}
