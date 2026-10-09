import { useLayoutEffect, type RefObject } from 'react';
import { floatingPosition, floatingSidePosition } from '@/shared/lib/floating-panel';

/** Keep an open floating panel within its viewport/container, with complete observer cleanup.
 * @param topElement Optional protected header or header list. Bounded callers consume --floating-max-height
 * to scroll oversized content before measurement; callers without a header keep prior geometry.
 * Below-header placement protects the first header and reserves an interior inset for subsequent
 * overlapping controls, allowing the shell/tail to stay attached without covering interactive copy.
 */
export function useAnchoredPanel(
  panel: RefObject<HTMLDivElement | null>,
  anchor: Element | null,
  container?: RefObject<HTMLElement | null>,
  bottomElement?: RefObject<HTMLElement | null>,
  placement: 'above' | 'side' | 'side-left' | 'below-header' = 'above',
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
        ...(placement === 'below-header' ? headers.slice(0, 1) : headers).map((header) =>
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
        // Interior guards affect copy/close spacing, not the header-attached shell's top edge.
        const inset =
          placement === 'below-header'
            ? Math.max(
                0,
                ...headers.slice(1).map((header) => {
                  const guard = header.current?.getBoundingClientRect();
                  if (
                    !guard ||
                    guard.right <= bounds.left + rect.left ||
                    guard.left >= bounds.left + rect.left + element.offsetWidth ||
                    guard.top >= bounds.top + rect.top + element.offsetHeight
                  )
                    return 0;
                  return guard.bottom - bounds.top - rect.top;
                }),
              )
            : 0;
        element.style.setProperty('--floating-content-inset', `${inset}px`);
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
      let side: 'left' | 'right' | null = null;
      if (placement === 'side' || placement === 'side-left') {
        const horizontal = floatingSidePosition(
          point,
          bounds,
          element.offsetWidth,
          element.offsetHeight,
          placement === 'side-left' ? 'left' : 'right',
          bottom,
          topBoundary,
        );
        rect = horizontal;
        side = horizontal.side;
      }
      element.style.setProperty('left', `${rect.left}px`);
      element.style.setProperty('top', `${rect.top}px`);
      element.style.setProperty('--tail-x', `${rect.tail}px`);
      element.setAttribute('data-below', String(rect.below));
      element.setAttribute('data-side', String(side === 'right'));
      element.setAttribute('data-side-left', String(side === 'left'));
      element.setAttribute('data-over-point', String(bounded && side === null && rect.overPoint));
      element.style.setProperty(
        '--tail-y',
        `${Math.max(18, Math.min(point.top + point.height / 2 - bounds.top - rect.top - 3, element.offsetHeight - 42))}px`,
      );
      element.style.setProperty(
        '--tail-center-y',
        `${point.top + point.height / 2 - bounds.top - rect.top}px`,
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
      mounted?.style.removeProperty('--floating-content-inset');
    };
  }, [panel, anchor, container, bottomElement, placement, topElement]);
}
