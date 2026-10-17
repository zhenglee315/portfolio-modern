import { DENIED_EYES } from '@/assets/cow-workspace/access-denied/eyes';
import armUrl from '@/assets/cow-workspace/access-denied/rig-cowArmLeftNoEntry.svg?url';
import frameUrl from '@/assets/cow-workspace/access-denied/rig-denied-eye-frame.svg?url';
import leftPupilUrl from '@/assets/cow-workspace/access-denied/rig-denied-pupil-left.svg?url';
import rightPupilUrl from '@/assets/cow-workspace/access-denied/rig-denied-pupil-right.svg?url';
import { COW_RIG_PART_IDS } from '@/assets/cow-workspace/scene-metadata';
import spriteUrl from '@/assets/cow-workspace/scene-sprite.svg?url';
import workspaceStyles from '@/shared/ui/cow-workspace/CowWorkspace.module.css';
import { useEffect, useId, useRef, type RefObject } from 'react';
import styles from './DeniedCowCharacter.module.css';

type Point = { x: number; y: number };

/** Convert viewport coordinates through the moving head, including responsive scene scaling. */
function drawingPointer(head: SVGGElement, pointer: Point): Point | null {
  const svg = head.ownerSVGElement;
  if (!svg) return null;
  const matrix = head.getScreenCTM?.();
  if (matrix && typeof svg.createSVGPoint === 'function') {
    const point = svg.createSVGPoint();
    point.x = pointer.x;
    point.y = pointer.y;
    try {
      const local = point.matrixTransform(matrix.inverse());
      return { x: local.x, y: local.y };
    } catch {
      return null;
    }
  }
  const bounds = svg.getBoundingClientRect();
  const scale = Math.min(bounds.width, bounds.height) / 1254;
  if (!scale) return null;
  return {
    x: (pointer.x - bounds.left - (bounds.width - 1254 * scale) / 2) / scale,
    y: (pointer.y - bounds.top - (bounds.height - 1254 * scale) / 2) / scale,
  };
}

/** Paint only the independent pupils; original brows and stepped eyelid clips remain fixed. */
function usePupilTracking(head: RefObject<SVGGElement | null>, motion: boolean) {
  useEffect(() => {
    const character = head.current;
    if (!character) return;
    const scene = character.closest<HTMLElement>('[data-cow-scene]');
    const pupils = [...character.querySelectorAll<SVGGElement>('[data-denied-cow-pupil]')];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    let frame = 0;
    let pointer: Point | null = null;
    const allowed = () =>
      motion &&
      fine.matches &&
      !reduced.matches &&
      !document.hidden &&
      document.documentElement.dataset.motionPaused !== 'true' &&
      scene?.dataset.cowMotion === 'active';
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      pointer = null;
      for (const pupil of pupils) pupil.setAttribute('transform', 'translate(0 0)');
    };
    const paint = () => {
      frame = 0;
      if (!pointer || !allowed()) return;
      const local = drawingPointer(character, pointer);
      if (!local) return;
      for (const [index, pupil] of pupils.entries()) {
        const eye = DENIED_EYES[index]!;
        const dx = local.x - eye.center.x;
        const dy = local.y - eye.center.y;
        const distance = Math.hypot(dx, dy);
        const influence = Math.min(distance / 320, 1);
        const x = distance ? (dx / distance) * eye.maxOffset.x * influence : 0;
        const y = distance ? (dy / distance) * eye.maxOffset.y * influence : 0;
        pupil.setAttribute('transform', `translate(${x.toFixed(3)} ${y.toFixed(3)})`);
      }
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || !allowed()) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const sync = () => {
      if (!allowed()) reset();
    };
    const observer = new MutationObserver(sync);
    if (scene) observer.observe(scene, { attributes: true, attributeFilter: ['data-cow-motion'] });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-motion-paused'],
    });
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerleave', reset);
    document.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', sync);
    fine.addEventListener('change', sync);
    return () => {
      reset();
      observer.disconnect();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerleave', reset);
      document.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', sync);
      reduced.removeEventListener('change', sync);
      fine.removeEventListener('change', sync);
    };
  }, [head, motion]);
}

/** Keep the existing torso/head/mouth and mouth-covering arm; only the sign arm is new art. */
export function DeniedCowCharacter({ motion }: { motion: boolean }) {
  const id = useId();
  const head = useRef<SVGGElement>(null);
  usePupilTracking(head, motion);
  return (
    <g data-cow-part="cow" data-cow-rig className={styles.cow} data-decoration="">
      <g
        data-cow-part="cow-body"
        data-cow-body-pose="neutral"
        className={workspaceStyles.cowRigBody}
      >
        <use href={`${spriteUrl}#${COW_RIG_PART_IDS.cowBodyComplete}`} />
      </g>
      <g data-cow-part="cow-arm-left" data-cow-arm-pose="no-entry" className={styles.signArm}>
        <use href={`${armUrl}#denied-left-arm`} transform="translate(32 0)" />
      </g>
      <g ref={head}>
        <g data-cow-part="cow-head">
          <use href={`${spriteUrl}#${COW_RIG_PART_IDS.cowHeadComplete}`} />
        </g>
        <g data-cow-part="cow-eyes">
          <defs>
            {DENIED_EYES.map((eye, index) => (
              <clipPath key={index} id={`${id}-eye-${index}`}>
                <use href={`${frameUrl}#${eye.clipId}`} />
              </clipPath>
            ))}
          </defs>
          <use href={`${frameUrl}#denied-eye-frame`} />
          {DENIED_EYES.map((_, index) => (
            <g key={index} clipPath={`url(#${id}-eye-${index})`}>
              <g data-denied-cow-pupil={index} transform="translate(0 0)">
                <use
                  href={`${index === 0 ? leftPupilUrl : rightPupilUrl}#denied-pupil-${index === 0 ? 'left' : 'right'}`}
                />
              </g>
            </g>
          ))}
        </g>
        <g data-cow-part="cow-mouth">
          <use href={`${spriteUrl}#${COW_RIG_PART_IDS.cowMouthNeutral}`} />
        </g>
      </g>
      <g
        data-cow-part="cow-arm-right"
        data-cow-arm-pose="mouth-covering"
        className={workspaceStyles.cowWatchingArm}
      >
        <use href={`${spriteUrl}#${COW_RIG_PART_IDS.cowArmLeftThinking}`} />
      </g>
    </g>
  );
}
