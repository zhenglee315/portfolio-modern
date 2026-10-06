import { useLayoutEffect, type RefObject } from 'react';
import { floatingPosition } from '@/shared/lib/floating-panel';

/** Keep an open floating panel within its viewport/container, with complete observer cleanup.
 * @param topElement Optional protected header or header list. Bounded callers consume --floating-max-height
 * to scroll oversized content before measurement; callers without a header keep prior geometry.
 */
export function useAnchoredPanel(
  panel: RefObject<HTMLDivElement | null>,
  anchor: Element | null,
  container?: RefObject<HTMLElement | null>,
  bottomElement?: RefObject<HTMLElement | null>,
  placement: 'above' | 'side' = 'above',
  topElement?: RefObject<HTMLElement | null> | readonly RefObject<HTMLElement | null>[],
) {
  useLayoutEffect(() => {
    // Multiple protected surfaces share one measured boundary, observer and content budget.
    const headers = topElement ? ('current' in topElement ? [topElement] : topElement) : [];
    let frame = 0;
    const mounted = panel.current;
    const position = () => {
      frame = 0;
      const element = panel.current;
      if (!element || !anchor) return;
      const bounds = container?.current?.getBoundingClientRect() ?? {
        left: 0,
        top: 0,
        width: innerWidth,
        height: innerHeight,
      };
      const bottom = bottomElement?.current
        ? bottomElement.current.getBoundingClientRect().top - bounds.top
        : bounds.height;
      const topBoundary = Math.max(
        0,
        ...headers.map((header) =>
          header.current ? header.current.getBoundingClientRect().bottom - bounds.top : 0,
        ),
      );
      const point = anchor.getBoundingClientRect();
      let rect = floatingPosition(
        point,
        bounds,
        element.offsetWidth,
        element.offsetHeight,
        bottom,
        topBoundary,
      );
      const bounded = headers.some((header) => header.current);
      if (bounded) {
        // Apply the available content budget before reading the now-constrained shell height.
        element.style.setProperty('--floating-max-height', `${rect.maxHeight}px`);
        rect = floatingPosition(
          point,
          bounds,
          element.offsetWidth,
          element.offsetHeight,
          bottom,
          topBoundary,
        );
      }
      if (placement === 'side') {
        rect.left = Math.max(
          14,
          Math.min(bounds.width - element.offsetWidth - 14, point.right - bounds.left + 18),
        );
        rect.top = Math.max(
          12,
          Math.min(bounds.height - element.offsetHeight - 12, point.top - bounds.top),
        );
        rect.below = false;
      }
      element.style.setProperty('left', `${rect.left}px`);
      element.style.setProperty('top', `${rect.top}px`);
      element.style.setProperty('--tail-x', `${rect.tail}px`);
      element.setAttribute('data-below', String(rect.below));
      element.setAttribute('data-side', String(placement === 'side'));
      element.setAttribute(
        'data-over-point',
        String(bounded && placement !== 'side' && rect.overPoint),
      );
      element.style.setProperty(
        '--tail-y',
        `${Math.max(18, Math.min(point.top + point.height / 2 - bounds.top - rect.top - 3, element.offsetHeight - 42))}px`,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(position);
    };
    const observer = new ResizeObserver(schedule);
    if (panel.current) observer.observe(panel.current);
    if (container?.current) observer.observe(container.current);
    if (bottomElement?.current) observer.observe(bottomElement.current);
    for (const header of headers) if (header.current) observer.observe(header.current);
    if (anchor) observer.observe(anchor);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    // Layout placement completes before first paint; later layout events remain coalesced.
    position();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      mounted?.style.removeProperty('--floating-max-height');
    };
  }, [panel, anchor, container, bottomElement, placement, topElement]);
}
