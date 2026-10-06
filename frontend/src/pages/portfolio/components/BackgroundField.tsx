import { lazy, Suspense, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { SectionBoundary } from '@/shared/ui/SectionBoundary';
import styles from './BackgroundField.module.css';

const BackgroundSignals = lazy(() => import('./BackgroundSignals'));
const finePointerQuery = '(hover: hover) and (pointer: fine)';

/** Keep the finite entrance frame and pointer halo available before optional signals load.
 * @param paused Effective motion preference, including hidden documents and reduced motion.
 * @param speed Validated appearance frequency forwarded to the bounded signal controller.
 * @param compact Desktop rail geometry; mobile offsets remain CSS-owned.
 * @returns Non-interactive viewport decoration; no API response or asset markup is interpreted.
 */
export default function BackgroundField({
  paused,
  speed,
  compact,
}: {
  paused: boolean;
  speed: number;
  compact: boolean;
}) {
  const { t } = useTranslation();
  // The shell never tracks input on the server. A desktop hydration snapshot avoids
  // one extra false-to-true listener reset before the first real mouse movement.
  const finePointer = useMediaQuery(finePointerQuery, true);
  const glow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const surface = glow.current;
    if (!surface || paused || !finePointer || !matchMedia(finePointerQuery).matches) return;
    let frame = 0,
      x = 0,
      y = 0;
    /** Release pending paint and fade out on exit, blur, touch or motion suspension. */
    const hide = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      surface.removeAttribute('data-visible');
    };
    /** Coalesce mouse coordinates into one paint; no frame is scheduled while idle. */
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return hide();
      x = event.clientX;
      y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        surface.style.setProperty('--pointer-glow-x', `${x}px`);
        surface.style.setProperty('--pointer-glow-y', `${y}px`);
        surface.setAttribute('data-visible', 'true');
      });
    };
    /** Ignore movement between page elements; only leaving the viewport hides the halo. */
    const leave = (event: PointerEvent) => {
      if (!event.relatedTarget) hide();
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerout', leave);
    window.addEventListener('blur', hide);
    return () => {
      hide();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerout', leave);
      window.removeEventListener('blur', hide);
    };
  }, [paused, finePointer]);
  return (
    <>
      <div className={styles.field} data-compact={compact} aria-hidden="true" data-background-field>
        <div className={styles.signals}>
          <div className={styles.gridPreview} />
          <SectionBoundary
            silent
            resetKey="background-signals"
            message={t('ui.unavailable')}
            retryLabel={t('ui.retry')}
          >
            <Suspense fallback={null}>
              <BackgroundSignals paused={paused} speed={speed} />
            </Suspense>
          </SectionBoundary>
        </div>
        <div className={styles.ambient} />
        <div className={`${styles.ruler} ${styles.left}`} data-field-edge="left" />
        <div className={`${styles.ruler} ${styles.right}`} data-field-edge="right" />
        <div className={`${styles.frame} ${styles.top}`} data-field-edge="top" />
        <div className={`${styles.frame} ${styles.bottom}`} data-field-edge="bottom" />
      </div>
      <div ref={glow} className={styles.glow} aria-hidden="true" data-pointer-glow />
    </>
  );
}
