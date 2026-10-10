import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

export type AuthMode = 'login' | 'register' | 'forgot';
export type AuthFormSnapshot = Partial<
  Record<AuthMode, Pick<CSSProperties, 'transform' | 'opacity' | 'filter'>>
>;
type Slide = {
  from: AuthMode;
  to: AuthMode;
  direction: number;
  progress: number;
  goal: number;
  phase: 'drag' | 'prepare' | 'animate';
  snapshot?: AuthFormSnapshot;
  dragAnchor?: { progress: number; snapshot: AuthFormSnapshot };
};

const canAnimate = () =>
  typeof HTMLElement.prototype.animate === 'function' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
  document.visibilityState !== 'hidden';

const viewStyle = (slide: Slide, view: AuthMode, progress = slide.progress): CSSProperties => {
  const outgoing = view === slide.from;
  const distance = outgoing ? progress : 1 - progress;
  const offset = slide.direction * (outgoing ? -distance : distance) * 14;
  return {
    transform: `translate3d(${offset}px, ${-distance * 10}px, 0) scale(${1 - distance * 0.06}, ${1 - distance * 0.16})`,
    // Close the old view first, then reveal the new one as it expands.
    opacity: outgoing ? Math.max(0, 1 - progress / 0.65) : Math.max(0, (progress - 0.25) / 0.75),
    filter: `blur(${distance * 2.5}px)`,
  };
};

/** Blend the interrupted view toward either gesture endpoint without resetting its visible pose. */
const blendView = (from: CSSProperties, to: CSSProperties, amount: number): CSSProperties => {
  const matrix = (value: CSSProperties['transform']) =>
    value && value !== 'none' ? new DOMMatrix(value) : new DOMMatrix();
  const first = matrix(from.transform);
  const last = matrix(to.transform);
  const mix = (start: number, end: number) => start + (end - start) * amount;
  const blur = (value: CSSProperties['filter']) =>
    value && value !== 'none' ? Number.parseFloat(value.replace('blur(', '')) : 0;
  return {
    transform: `translate3d(${mix(first.m41, last.m41)}px, ${mix(first.m42, last.m42)}px, 0) scale(${mix(first.m11, last.m11)}, ${mix(first.m22, last.m22)})`,
    opacity: mix(Number(from.opacity ?? 1), Number(to.opacity ?? 1)),
    filter: `blur(${mix(blur(from.filter), blur(to.filter))}px)`,
  };
};

/** Collapse and expand under the finger, preserving rendered motion on rapid reversal. */
export function useAuthFormSlide(mode: AuthMode) {
  const [slide, setSlide] = useState<Slide | null>(null);
  const current = useRef<Slide | null>(null);
  const publish = useCallback((next: Slide | null) => {
    current.current = next;
    setSlide(next);
  }, []);

  useEffect(() => {
    if (slide?.phase !== 'prepare') return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (current.current === slide)
          publish({ ...slide, progress: slide.goal, phase: 'animate' });
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [slide, publish]);

  useEffect(() => {
    if (slide?.phase !== 'animate') return;
    // Expansion and rebound finish at 480ms; also handle missing transition-end events.
    const timer = setTimeout(() => {
      if (current.current === slide) publish(null);
    }, 560);
    return () => clearTimeout(timer);
  }, [slide, publish]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cancel = () => {
      if (preference.matches || document.visibilityState === 'hidden') publish(null);
    };
    preference.addEventListener('change', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => {
      preference.removeEventListener('change', cancel);
      document.removeEventListener('visibilitychange', cancel);
    };
  }, [publish]);

  const start = (next: AuthMode, snapshot: AuthFormSnapshot) => {
    if (!canAnimate()) return publish(null);
    const previous = current.current;
    publish({
      from: mode,
      to: next,
      direction: next === 'login' ? -1 : 1,
      progress:
        previous?.phase === 'drag' && previous.from === mode && previous.to === next
          ? previous.progress
          : 0,
      goal: 1,
      phase: 'prepare',
      snapshot,
    });
  };

  const drag = (position: number | null, readSnapshot?: () => AuthFormSnapshot) => {
    if (position === null) {
      const previous = current.current;
      if (previous?.phase === 'drag') publish({ ...previous, goal: 0, phase: 'prepare' });
      return;
    }
    if (!canAnimate()) return;
    const previous = current.current;
    const progress = mode === 'register' ? 1 - position : position;
    const dragAnchor =
      previous?.phase === 'drag'
        ? previous.dragAnchor
        : previous && readSnapshot
          ? { progress, snapshot: readSnapshot() }
          : undefined;
    publish({
      from: mode,
      to: mode === 'register' ? 'login' : 'register',
      direction: mode === 'register' ? -1 : 1,
      progress,
      goal: 0,
      phase: 'drag',
      dragAnchor,
    });
  };

  const style = (view: AuthMode): CSSProperties | undefined => {
    if (!slide) return;
    if (slide.phase === 'prepare' && slide.snapshot?.[view]) return slide.snapshot[view];
    const anchor = slide.dragAnchor;
    const snapshot = anchor?.snapshot[view];
    if (slide.phase !== 'animate' && anchor && snapshot) {
      const endpoint = slide.progress >= anchor.progress ? 1 : 0;
      const distance = Math.abs(endpoint - anchor.progress);
      const amount = distance ? Math.abs(slide.progress - anchor.progress) / distance : 0;
      return blendView(snapshot, viewStyle(slide, view, endpoint), amount);
    }
    return viewStyle(slide, view);
  };

  return {
    active: slide !== null,
    phase: slide?.phase,
    entering: (view: AuthMode) =>
      slide ? view === (slide.goal === 1 ? slide.to : slide.from) : undefined,
    previewMode: slide ? (mode === slide.from ? slide.to : slide.from) : null,
    start,
    drag,
    style,
    finish: () => {
      if (current.current?.phase === 'animate') publish(null);
    },
  };
}
