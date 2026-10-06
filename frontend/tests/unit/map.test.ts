import { describe, expect, it } from 'vitest';
import {
  projectPoint,
  routePath,
  placeLabels,
  intersects,
} from '@/features/journey/model/geometry';
import { floatingPosition } from '@/shared/lib/floating-panel';

describe('atlas and popup geometry', () => {
  it('keeps atlas projection metadata and finite pole clamps', () => {
    expect(projectPoint({ latitude: 34, longitude: 58 })).toEqual([540, 245]);
    expect(projectPoint({ latitude: 90, longitude: 0 }).every(Number.isFinite)).toBe(true);
    expect(routePath([10, 10], [10, 10])).toContain(' C ');
    expect(routePath([10, 10], [100, 100])).toContain(' Q ');
  });
  it('prioritizes selected labels without intersecting visible text bounds', () => {
    const labels = [1, 2, 3].map((id) => ({
      id,
      point: [500, 200] as const,
      width: 70,
      height: 15,
    }));
    const result = placeLabels(labels, 2, 1);
    expect(result.get(2)).toBeDefined();
    const visible = [...result.values()].filter((value) => value !== undefined);
    for (const [index, a] of visible.entries())
      for (const b of visible.slice(index + 1)) expect(intersects(a, b)).toBe(false);
  });
  it('constrains floating panels and keeps the tail within its shell', () => {
    const result = floatingPosition(
      { left: 380, top: 20, width: 10, height: 10 },
      { left: 0, top: 0, width: 390, height: 500 },
      300,
      200,
      450,
    );
    expect(result.left).toBe(78);
    expect(result.top).toBeGreaterThanOrEqual(12);
    expect(result.top + 200).toBeLessThanOrEqual(450);
    expect(result.tail).toBeLessThanOrEqual(258);
  });
});
