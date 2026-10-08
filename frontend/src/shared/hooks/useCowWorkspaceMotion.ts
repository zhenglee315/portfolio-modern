import { useCallback, useEffect, useRef, type PointerEvent } from 'react';

export type CowWorkspacePhase = 'thinking' | 'typing' | 'glance';

export interface CowWorkspaceMotionOptions {
  motion?: boolean;
  parallax?: boolean;
  /** Hold a pose for previews; omitted values run the ambient sequence. */
  phase?: CowWorkspacePhase;
}

interface MotionController {
  move: (event: PointerEvent<HTMLDivElement>) => void;
  leave: () => void;
  glance: () => void;
}

interface PhaseClock {
  phase: CowWorkspacePhase;
  remaining: number;
  forcedPhase: CowWorkspacePhase | undefined;
}

const phaseOrder: Record<CowWorkspacePhase, CowWorkspacePhase> = {
  thinking: 'typing',
  typing: 'glance',
  glance: 'thinking',
};

function phaseDuration(phase: CowWorkspacePhase) {
  const ranges: Record<CowWorkspacePhase, [number, number]> = {
    thinking: [4200, 7800],
    typing: [3200, 6200],
    glance: [1500, 2600],
  };
  const [minimum, maximum] = ranges[phase];
  return minimum + Math.random() * (maximum - minimum);
}

/** Paint a local SVG scene without rerendering React on pointer movement.
 * Ambient timers and easing stop outside the viewport or when motion is paused.
 */
export function useCowWorkspaceMotion({
  motion = true,
  parallax = true,
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
    let pointerInside = false;
    let nextGlanceAt = 0;
    // Preference toggles rebuild subscriptions, but keep the ongoing performance.
    // Choosing or releasing an explicit pose intentionally starts a new phase.
    const saved = clock.current?.forcedPhase === phase ? clock.current : null;
    let currentPhase = saved?.phase ?? phase ?? 'thinking';
    let remaining = saved?.remaining ?? phaseDuration(currentPhase);
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
      pointerInside = false;
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
        currentPhase = phaseOrder[currentPhase];
        element.dataset.cowPhase = currentPhase;
        remaining = phaseDuration(currentPhase);
        schedulePhase();
      }, remaining);
    };

    const glance = () => {
      const now = performance.now();
      if (!active || phase || now < nextGlanceAt || currentPhase === 'glance') return;
      nextGlanceAt = now + 6000;
      clearTimeout(timer);
      currentPhase = 'glance';
      element.dataset.cowPhase = currentPhase;
      remaining = phaseDuration(currentPhase);
      schedulePhase();
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

    controller.current = {
      move: (event) => {
        if (!active || event.pointerType === 'touch' || !finePointer.matches) return;
        if (!pointerInside) glance();
        pointerInside = true;
        if (!parallax) return;
        const bounds = element.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        targetX = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1));
        targetY = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1));
        startPointer();
      },
      leave: () => {
        pointerInside = false;
        if (!active || !parallax || !finePointer.matches) return;
        targetX = targetY = 0;
        startPointer();
      },
      glance,
    };

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
    reconcile();

    return () => {
      stopped = true;
      controller.current = null;
      if (timer !== undefined) remaining = Math.max(0, deadline - performance.now());
      clock.current = { phase: currentPhase, remaining, forcedPhase: phase };
      clearTimeout(timer);
      stopPointer();
      intersection?.disconnect();
      preferenceObserver.disconnect();
      document.removeEventListener('visibilitychange', reconcile);
      reducedMotion.removeEventListener('change', reconcile);
      finePointer.removeEventListener('change', reconcile);
      element.dataset.cowMotion = 'paused';
    };
  }, [motion, parallax, phase]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    controller.current?.move(event);
  }, []);
  const onPointerLeave = useCallback(() => controller.current?.leave(), []);
  const onPointerDown = useCallback(() => controller.current?.glance(), []);

  return { ref, onPointerMove, onPointerLeave, onPointerDown };
}
