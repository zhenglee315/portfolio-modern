import { describe, expect, it } from 'vitest';
import { reorderFlowLayout, reorderLayout } from '@/pages/profile/model/reorder-layout';

describe('category drag layout', () => {
  it('makes an exact full-card space in a vertical list without changing the stored order', () => {
    const items = [
      { id: 'a', left: 20, top: 10, width: 240, height: 100 },
      { id: 'b', left: 20, top: 118, width: 240, height: 140 },
      { id: 'c', left: 20, top: 266, width: 240, height: 80 },
    ];
    const result = reorderLayout(items, 'b', { id: 'a', placement: 'before' }, 1, 8);
    expect(result).toEqual({ b: { x: 0, y: -108 }, a: { x: 0, y: 148 }, c: { x: 0, y: 0 } });
    expect(items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(reorderLayout(items, 'b', null, 1, 8)).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 0, y: 0 },
      c: { x: 0, y: 0 },
    });
  });

  it('moves full grid cells across columns and preserves row spacing', () => {
    const items = [
      { id: 'a', left: 20, top: 10, width: 200, height: 100 },
      { id: 'b', left: 228, top: 10, width: 200, height: 100 },
      { id: 'c', left: 20, top: 118, width: 200, height: 100 },
      { id: 'd', left: 228, top: 118, width: 200, height: 100 },
    ];
    expect(reorderLayout(items, 'd', { id: 'a', placement: 'before' }, 2, 8)).toEqual({
      d: { x: -208, y: -108 },
      a: { x: 208, y: 0 },
      b: { x: -208, y: 108 },
      c: { x: 208, y: 0 },
    });
  });
});

describe('wrapped skill drag layout', () => {
  it('reserves the moved chip’s own width and reflows neighbors into actual flex rows', () => {
    const items = [
      { id: 'python', left: 20, top: 10, width: 100, height: 40 },
      { id: 'fastapi', left: 130, top: 10, width: 130, height: 40 },
      { id: 'long', left: 20, top: 60, width: 250, height: 40 },
      { id: 'rest', left: 20, top: 110, width: 90, height: 40 },
    ];
    const flow = { left: 20, top: 10, width: 300, columnGap: 10, rowGap: 10 };
    expect(reorderFlowLayout(items, 'long', { id: 'python', placement: 'before' }, flow)).toEqual({
      long: { x: 0, y: -50 },
      python: { x: 0, y: 50 },
      fastapi: { x: 0, y: 50 },
      rest: { x: 0, y: 0 },
    });
    expect(reorderFlowLayout(items, 'python', { id: 'long', placement: 'after' }, flow)).toEqual({
      fastapi: { x: -110, y: 0 },
      long: { x: 0, y: 0 },
      python: { x: 0, y: 100 },
      rest: { x: 110, y: 0 },
    });
    expect(reorderFlowLayout(items, 'python', null, flow).long).toEqual({ x: 0, y: 0 });
    expect(items.map((item) => item.id)).toEqual(['python', 'fastapi', 'long', 'rest']);
  });

  it('centers different chip heights without discarding fractional widths', () => {
    const items = [
      { id: 'a', left: 10, top: 25, width: 80.25, height: 30 },
      { id: 'b', left: 100.25, top: 10, width: 140.5, height: 60 },
    ];
    expect(
      reorderFlowLayout(
        items,
        'b',
        { id: 'a', placement: 'before' },
        {
          left: 10,
          top: 10,
          width: 230.75,
          columnGap: 10,
          rowGap: 8,
        },
      ),
    ).toEqual({ b: { x: -90.25, y: 0 }, a: { x: 150.5, y: 0 } });
  });
});
