import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { atlasViewport, placeLabels, projectPoint } from '../model/geometry';
import type { JourneyStop } from '../schemas/journey';

/** Measure SVG labels after fonts/layout and update only owned presentation attributes.
 * @returns Stable paint-priority callback; arrival emphasis never updates React selection.
 */
export function useMapLabels(
  root: RefObject<SVGSVGElement | null>,
  items: JourneyStop[],
  selectedId: number,
) {
  const priority = useRef(selectedId);
  const request = useRef<(() => void) | undefined>(undefined);
  useLayoutEffect(() => {
    if (!items.some((entry) => entry.id === priority.current)) priority.current = selectedId;
    let frame = 0,
      stopped = false;
    const measure = () => {
      frame = 0;
      const svg = root.current;
      if (!svg || stopped) return;
      const screen = svg.getBoundingClientRect();
      const viewport = atlasViewport(
        items.map(projectPoint),
        screen.width,
        screen.height,
        innerWidth >= 1700,
      );
      svg.setAttribute(
        'viewBox',
        `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`,
      );
      const scale = svg.getScreenCTM()?.a || 1;
      const nodes = Array.from(svg.querySelectorAll<SVGGElement>('[data-stop]'));
      const labels = nodes.flatMap((node) => {
        const text = node.querySelector('text');
        if (!text) return [];
        text.style.fontSize = `${Math.max(12, 10 / scale)}px`;
        const box = text.getBBox();
        return [
          {
            id: Number(node.dataset.stop),
            point: [Number(node.dataset.x), Number(node.dataset.y)] as const,
            width: box.width,
            height: box.height,
          },
        ];
      });
      const positions = placeLabels(labels, priority.current, scale, viewport);
      for (const node of nodes) {
        const text = node.querySelector('text'),
          leader = node.querySelector('[data-leader]');
        if (!text) continue;
        const rect = positions.get(Number(node.dataset.stop));
        text.setAttribute('visibility', rect ? 'visible' : 'hidden');
        if (!rect) {
          leader?.setAttribute('d', '');
          continue;
        }
        const x = Number(node.dataset.x),
          y = Number(node.dataset.y),
          box = text.getBBox();
        text.setAttribute('x', String(rect.x - x));
        text.setAttribute('y', String(rect.y - y - box.y + Number(text.getAttribute('y') ?? 0)));
        leader?.setAttribute(
          'd',
          `M 0 0 L ${Math.max(rect.x, Math.min(rect.x + rect.width, x)) - x} ${Math.max(rect.y, Math.min(rect.y + rect.height, y)) - y}`,
        );
      }
    };
    const schedule = () => {
      if (!frame && !stopped) frame = requestAnimationFrame(measure);
    };
    request.current = schedule;
    const observer = new ResizeObserver(schedule);
    if (root.current) observer.observe(root.current);
    schedule();
    void document.fonts?.ready.then(schedule);
    return () => {
      stopped = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      request.current = undefined;
    };
  }, [root, items, selectedId]);
  return useCallback((id: number) => {
    if (priority.current === id) return;
    priority.current = id;
    request.current?.();
  }, []);
}
