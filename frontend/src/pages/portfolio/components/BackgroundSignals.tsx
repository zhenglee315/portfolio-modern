import { useEffect, useRef } from 'react';
import { signalGeometry } from '../model/signals';
import styles from './BackgroundField.module.css';

/** Draw optional viewport signals independently of the always-present entrance frame.
 * @param paused Effective preference including hidden documents and reduced motion.
 * @param speed Validated appearance frequency; rebuilding releases all previous work.
 * @returns A geometry-only SVG; chunk failure leaves the static field and pointer usable.
 */
export default function BackgroundSignals({ paused, speed }: { paused: boolean; speed: number }) {
  const field = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const surface = field.current;
    if (!surface) return;
    let timer: ReturnType<typeof setTimeout> | undefined,
      frame = 0;
    const active = new Map<SVGPathElement, Animation>();
    let crosses: SVGPathElement[] = [];
    /** Cancel the complete previous pulse generation before resize or teardown. */
    const cancel = () => {
      clearTimeout(timer);
      active.forEach((animation) => animation.cancel());
      active.clear();
    };
    /** Allocate a small randomized batch under the concurrent-animation ceiling. */
    const pulse = () => {
      if (paused || typeof surface.animate !== 'function') return;
      const available = crosses.filter((cross) => !active.has(cross));
      const count = Math.min(
        available.length,
        6 - active.size,
        Math.max(1, Math.round(crosses.length / 42)),
      );
      for (let i = 0; i < count; i++) {
        const cross = available.splice(Math.floor(Math.random() * available.length), 1)[0]!;
        const animation = cross.animate(
          [
            { offset: 0, opacity: 0.15, transform: 'scale(1)' },
            { offset: 0.1, opacity: 0.7, transform: 'scale(1.08)' },
            { offset: 0.23, opacity: 0.23, transform: 'scale(1)' },
            {
              offset: 0.36,
              opacity: 1,
              transform: 'scale(1.16)',
              filter: 'drop-shadow(0 0 6px var(--accent))',
            },
            { offset: 0.55, opacity: 0.36, transform: 'scale(1.02)' },
            { offset: 1, opacity: 0.15, transform: 'scale(1)' },
          ],
          { duration: 1700 / speed, easing: 'ease-in-out' },
        );
        active.set(cross, animation);
        animation.onfinish = () => active.delete(cross);
      }
      timer = setTimeout(pulse, (220 + Math.random() * 350) / speed);
    };
    /** Rebuild trusted local paths from the current viewport, never document height. */
    const draw = () => {
      cancel();
      const { width, height } = surface.getBoundingClientRect();
      const geometry = signalGeometry(width, height);
      surface.setAttribute('viewBox', `0 0 ${Math.max(1, width)} ${Math.max(1, height)}`);
      /** Create a geometry-only SVG node; no externally supplied markup enters this field. */
      const path = (d: string, className: string) => {
        const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        node.setAttribute('d', d);
        node.setAttribute('class', className);
        return node;
      };
      crosses = geometry.crosses.map((d) => path(d, styles.cross!));
      surface.replaceChildren(path(geometry.grid, styles.grid!), ...crosses);
      surface.parentElement?.setAttribute('data-signals-ready', 'true');
      pulse();
    };
    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    });
    resize.observe(surface);
    draw();
    return () => {
      resize.disconnect();
      cancelAnimationFrame(frame);
      cancel();
      surface.parentElement?.removeAttribute('data-signals-ready');
    };
  }, [paused, speed]);
  return <svg ref={field} className={styles.signalSvg} focusable="false" />;
}
