import { describe, expect, it } from 'vitest';
import { floatingPosition, floatingSidePosition } from '@/shared/lib/floating-panel';

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

describe('side floating-panel geometry', () => {
  it('keeps a fitting left-side panel beside its trigger with a right-facing tail', () => {
    const anchor = { left: 310, top: 160, width: 30, height: 30 };
    const result = floatingSidePosition(anchor, container, 180, 80, 'left');
    expect(result.side).toBe('left');
    expect(result.left).toBe(102);
    expect(container.left + result.left + 180).toBe(anchor.left - 18);
    expect(container.top + result.top + 40).toBe(anchor.top + anchor.height / 2);
    expect(result.below).toBe(false);
  });

  it('falls back to vertical placement at the left edge instead of covering its trigger', () => {
    const anchor = { left: 28, top: 230, width: 30, height: 30 };
    const result = floatingSidePosition(anchor, container, 220, 80, 'left');
    const ordinary = floatingPosition(anchor, container, 220, 80);
    expect(result).toEqual({ ...ordinary, side: null });
    expect(result.left).toBeGreaterThanOrEqual(12);
    expect(result.left + 220).toBeLessThanOrEqual(container.width - 12);
    expect(result.top + 80).toBeLessThan(anchor.top - container.top);
  });

  it('uses the existing below placement when a narrow-screen trigger is near the top', () => {
    const anchor = { left: 28, top: 30, width: 30, height: 30 };
    const result = floatingSidePosition(anchor, container, 220, 80, 'left');
    expect(result.side).toBeNull();
    expect(result.below).toBe(true);
    expect(result).toEqual({ ...floatingPosition(anchor, container, 220, 80), side: null });
  });

  it('preserves the existing right-side origin and viewport clamp', () => {
    const anchor = { left: 310, top: 410, width: 30, height: 30 };
    const result = floatingSidePosition(anchor, container, 180, 80, 'right');
    expect(result.side).toBe('right');
    expect(result.left).toBe(156);
    expect(result.top).toBe(338);
    expect(result.below).toBe(false);
  });
});
