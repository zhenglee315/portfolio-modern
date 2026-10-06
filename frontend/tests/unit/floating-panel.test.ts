import { describe, expect, it } from 'vitest';
import { floatingPosition } from '@/shared/lib/floating-panel';

const container = { left: 10, top: 20, width: 350, height: 430 };

describe('protected floating-panel geometry', () => {
  /** Reproduce a mobile marker whose ordinary above placement would cover its caption. */
  it('keeps a popup below the protected caption and above destination controls', () => {
    const result = floatingPosition(
      { left: 210, top: 210, width: 10, height: 10 },
      container,
      320,
      190,
      400,
      70,
    );
    expect(result.top).toBeGreaterThanOrEqual(82);
    expect(result.top + 190).toBeLessThanOrEqual(376);
    expect(result.left).toBeGreaterThanOrEqual(12);
    expect(result.left + 320).toBeLessThanOrEqual(338);
    expect(result.tail).toBeGreaterThanOrEqual(26);
    expect(result.tail).toBeLessThanOrEqual(278);
    expect(result.overPoint).toBe(true);
  });

  /** Oversized detail must use its returned height budget before positioning the final shell. */
  it('provides a scroll budget that makes long detail fit between both protected surfaces', () => {
    const anchor = { left: 210, top: 190, width: 10, height: 10 };
    const natural = floatingPosition(anchor, container, 320, 500, 400, 70);
    expect(natural.maxHeight).toBe(294);
    const constrained = floatingPosition(anchor, container, 320, natural.maxHeight, 400, 70);
    expect(constrained.top).toBe(82);
    expect(constrained.top + natural.maxHeight).toBe(376);
  });

  /** No header is opt-in: existing contact and ordinary popup origins retain their positions. */
  it('retains default geometry and points the tail toward an unobstructed anchor', () => {
    const anchor = { left: 200, top: 200, width: 10, height: 10 };
    const ordinary = floatingPosition(anchor, container, 200, 100, 400);
    const explicit = floatingPosition(anchor, container, 200, 100, 400, 0);
    expect(ordinary).toEqual(explicit);
    expect(ordinary.top).toBe(61);
    expect(ordinary.below).toBe(false);
    expect(ordinary.overPoint).toBe(false);
  });
});
