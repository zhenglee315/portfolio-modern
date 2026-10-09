import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from 'react';

export type CowWorkspacePhase = 'thinking' | 'typing' | 'glance';

export interface CowWorkspaceMotionOptions {
  /** Enable ambient phases and scene animation, subject to visibility and motion preferences. */
  motion?: boolean;
  /** Enable eased tracking for a fine pointer without capturing touch gestures. */
  parallax?: boolean;
  /** Track the local scene by default, or the entire page around an optional origin. */
  pointerScope?: 'scene' | 'page';
  /** Measure the current element's center for tracking; absent it, use the scene bounds. */
  pointerOrigin?: RefObject<HTMLElement | null>;
  /** Hold the selected expression; omitted values run the ambient sequence. */
  phase?: CowWorkspacePhase;
}

interface MotionController {
  move: (event: Pick<globalThis.PointerEvent, 'clientX' | 'clientY' | 'pointerType'>) => void;
  leave: () => void;
}

interface PhaseClock {
  phase: CowWorkspacePhase;
  sequenceIndex: number;
  remaining: number;
  forcedPhase: CowWorkspacePhase | undefined;
}

const phaseSequence = ['thinking', 'typing', 'glance', 'typing'] as const;
const phaseDuration = 3000;

/**
 * Return a scene ref and local pointer handlers, painting motion without React frame updates.
 * Page tracking uses window events and normalizes each axis from pointerOrigin to the viewport edge.
 * Ambient timers and easing stop outside the viewport or when motion is paused.
 * Effects release observers, listeners, timers and frames while retaining the remaining phase time.
 */
export function useCowWorkspaceMotion({
  motion = true,
  parallax = true,
  pointerScope = 'scene',
  pointerOrigin,
  phase,
}: CowWorkspaceMotionOptions = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const controller = useRef<MotionController | null>(null);
  const clock = useRef<PhaseClock | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const initialBounds = element.getBoundingClientRect();
    let inViewport =
      initialBounds.bottom > 0 &&
      initialBounds.right > 0 &&
      initialBounds.top < window.innerHeight &&
      initialBounds.left < window.innerWidth;
    let active = false;
    let stopped = false;
    // Preference toggles rebuild subscriptions, but keep the ongoing performance.
    // Choosing or releasing an explicit pose intentionally starts a new phase.
    const saved = clock.current?.forcedPhase === phase ? clock.current : null;
    let sequenceIndex = saved?.sequenceIndex ?? 0;
    let currentPhase = saved?.phase ?? phase ?? 'thinking';
    let remaining = saved?.remaining ?? phaseDuration;
    let deadline = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let previousFrame = 0;
    let x = 0;
    let y = 0;
    let targetX = 0;
    let targetY = 0;
    let paintedX: string | undefined;
    let paintedY: string | undefined;

    const paintPointer = () => {
      const nextX = x.toFixed(4);
      const nextY = y.toFixed(4);
      if (nextX !== paintedX) {
        element.style.setProperty('--cow-pointer-x', nextX);
        element.style.setProperty('--cow-look-x', (x * 0.75).toFixed(4));
        paintedX = nextX;
      }
      if (nextY !== paintedY) {
        element.style.setProperty('--cow-pointer-y', nextY);
        element.style.setProperty('--cow-look-y', (y * 0.55).toFixed(4));
        paintedY = nextY;
      }
    };

    const stopPointer = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previousFrame = 0;
      targetX = targetY = x = y = 0;
      paintPointer();
    };

    const easePointer = (now: number) => {
      frame = 0;
      if (stopped || !active || !parallax || !finePointer.matches) return;
      const elapsed = previousFrame ? Math.min(64, now - previousFrame) : 16;
      previousFrame = now;
      const amount = 1 - Math.exp(-elapsed / 105);
      x += (targetX - x) * amount;
      y += (targetY - y) * amount;
      const settled = Math.abs(targetX - x) + Math.abs(targetY - y) < 0.001;
      if (settled) {
        x = targetX;
        y = targetY;
      }
      paintPointer();
      if (settled) previousFrame = 0;
      else frame = requestAnimationFrame(easePointer);
    };

    const startPointer = () => {
      if (!frame) frame = requestAnimationFrame(easePointer);
    };

    const schedulePhase = () => {
      if (!active || phase || stopped) return;
      deadline = performance.now() + remaining;
      timer = setTimeout(() => {
        timer = undefined;
        if (!active || stopped) return;
        sequenceIndex = (sequenceIndex + 1) % phaseSequence.length;
        currentPhase = phaseSequence[sequenceIndex] ?? 'thinking';
        element.dataset.cowPhase = currentPhase;
        remaining = phaseDuration;
        schedulePhase();
      }, remaining);
    };

    const reconcile = () => {
      if (stopped) return;
      const nextActive =
        motion &&
        !reducedMotion.matches &&
        !document.hidden &&
        document.documentElement.dataset.motionPaused !== 'true' &&
        inViewport;
      if (nextActive !== active) {
        active = nextActive;
        element.dataset.cowMotion = active ? 'active' : 'paused';
        if (active) schedulePhase();
        else {
          if (timer !== undefined) {
            remaining = Math.max(0, deadline - performance.now());
            clearTimeout(timer);
            timer = undefined;
          }
          stopPointer();
        }
      }
      if (!parallax || !finePointer.matches) stopPointer();
    };

    const pointer: MotionController = {
      move: (event) => {
        if (!active || event.pointerType === 'touch' || !finePointer.matches) return;
        if (!parallax) return;
        const bounds = (pointerOrigin?.current ?? element).getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const centerX = bounds.left + bounds.width / 2;
        const centerY = bounds.top + bounds.height / 2;
        // Page tracking stays gradual throughout the viewport instead of saturating
        // as soon as the pointer leaves the smaller input region.
        const reachX =
          pointerScope === 'page'
            ? Math.max(1, event.clientX < centerX ? centerX : window.innerWidth - centerX)
            : bounds.width / 2;
        const reachY =
          pointerScope === 'page'
            ? Math.max(1, event.clientY < centerY ? centerY : window.innerHeight - centerY)
            : bounds.height / 2;
        targetX = Math.max(-1, Math.min(1, (event.clientX - centerX) / reachX));
        targetY = Math.max(-1, Math.min(1, (event.clientY - centerY) / reachY));
        startPointer();
      },
      leave: () => {
        if (!active || !parallax || !finePointer.matches) return;
        targetX = targetY = 0;
        startPointer();
      },
    };
    controller.current = pointer;

    element.dataset.cowPhase = currentPhase;
    element.dataset.cowMotion = 'paused';
    paintPointer();
    const intersection =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(
            ([entry]) => {
              inViewport = entry?.isIntersecting ?? false;
              reconcile();
            },
            { threshold: 0 },
          );
    intersection?.observe(element);
    const preferenceObserver = new MutationObserver(reconcile);
    preferenceObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-motion-paused'],
    });
    document.addEventListener('visibilitychange', reconcile);
    reducedMotion.addEventListener('change', reconcile);
    finePointer.addEventListener('change', reconcile);
    if (pointerScope === 'page') {
      window.addEventListener('pointermove', pointer.move, { passive: true });
      document.addEventListener('pointerleave', pointer.leave);
      window.addEventListener('blur', stopPointer);
    }
    reconcile();

    return () => {
      stopped = true;
      controller.current = null;
      if (timer !== undefined) remaining = Math.max(0, deadline - performance.now());
      clock.current = { phase: currentPhase, sequenceIndex, remaining, forcedPhase: phase };
      clearTimeout(timer);
      stopPointer();
      intersection?.disconnect();
      preferenceObserver.disconnect();
      document.removeEventListener('visibilitychange', reconcile);
      reducedMotion.removeEventListener('change', reconcile);
      finePointer.removeEventListener('change', reconcile);
      if (pointerScope === 'page') {
        window.removeEventListener('pointermove', pointer.move);
        document.removeEventListener('pointerleave', pointer.leave);
        window.removeEventListener('blur', stopPointer);
      }
      element.dataset.cowMotion = 'paused';
    };
  }, [motion, parallax, phase, pointerScope, pointerOrigin]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    controller.current?.move(event);
  }, []);
  const onPointerLeave = useCallback(() => controller.current?.leave(), []);
  return {
    ref,
    onPointerMove: pointerScope === 'scene' ? onPointerMove : undefined,
    onPointerLeave: pointerScope === 'scene' ? onPointerLeave : undefined,
  };
}
