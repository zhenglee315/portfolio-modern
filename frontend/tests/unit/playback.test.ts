import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advancePlayback, playbackSnapshot } from '@/features/journey/model/playback';
import { useJourneyPlayback } from '@/features/journey/hooks/useJourneyPlayback';
import { journeySchema } from '@/features/journey/schemas/journey';
import { journeyFixture } from '../fixtures/portfolio';

describe('journey playback clock', () => {
  it('holds, flies, arrives and advances only after the complete chapter', () => {
    expect(playbackSnapshot({ index: 0, elapsed: 1000 }, 3).phase).toBe('holding');
    expect(playbackSnapshot({ index: 0, elapsed: 4100 }, 3).progress).toBe(0.5);
    expect(playbackSnapshot({ index: 0, elapsed: 6800 }, 3).progress).toBe(1);
    expect(advancePlayback({ index: 0, elapsed: 7100 }, 200, 3)).toEqual({
      index: 1,
      elapsed: 100,
    });
  });
  it('rests at the final stop without a return arc and restarts after 3000ms', () => {
    expect(playbackSnapshot({ index: 2, elapsed: 2900 }, 3)).toMatchObject({
      phase: 'final-hold',
      last: true,
      progress: 0,
    });
    expect(advancePlayback({ index: 2, elapsed: 2900 }, 200, 3)).toEqual({
      index: 0,
      elapsed: 100,
    });
    expect(advancePlayback({ index: 0, elapsed: 0 }, 0, 0)).toEqual({ index: 0, elapsed: 0 });
    expect(advancePlayback({ index: 0, elapsed: 0 }, 17400, 3)).toEqual({ index: 0, elapsed: 0 });
  });
});

describe('journey page suspension', () => {
  const items = journeySchema.parse(journeyFixture);
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const step = (now: number) => {
    const pending = [...frames.values()];
    frames.clear();
    act(() => pending.forEach((callback) => callback(now)));
  };

  beforeEach(() => {
    frames.clear();
    frameId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('cancels hidden page work and resumes the same chapter without counting hidden time', () => {
    const onSelect = vi.fn();
    const paint = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ suspended }) => useJourneyPlayback(items, items[0]!.id, onSelect, paint, suspended),
      { initialProps: { suspended: false } },
    );
    step(100);
    step(180);
    expect(paint).toHaveBeenLastCalledWith({ index: 0, elapsed: 80 });

    rerender({ suspended: true });
    expect(result.current.playing).toBe(false);
    expect(result.current.phase).toBe('paused');
    expect(frames.size).toBe(0);
    step(20000);
    expect(paint).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();

    rerender({ suspended: false });
    expect(result.current.playing).toBe(true);
    step(20080);
    expect(paint).toHaveBeenLastCalledWith({ index: 0, elapsed: 80 });
    step(20160);
    expect(paint).toHaveBeenLastCalledWith({ index: 0, elapsed: 160 });
    unmount();
    expect(frames.size).toBe(0);
  });

  it('retains a manually selected and paused stop after suspension', () => {
    const onSelect = vi.fn();
    const paint = vi.fn();
    const { result, rerender } = renderHook(
      ({ suspended, selectedId }) =>
        useJourneyPlayback(items, selectedId, onSelect, paint, suspended),
      { initialProps: { suspended: false, selectedId: items[0]!.id } },
    );
    act(() => result.current.select(items[1]!.id));
    expect(onSelect).toHaveBeenLastCalledWith(items[1]!.id);
    rerender({ suspended: true, selectedId: items[1]!.id });
    expect(frames.size).toBe(0);

    rerender({ suspended: false, selectedId: items[1]!.id });
    step(20000);
    expect(result.current.playing).toBe(false);
    expect(result.current.phase).toBe('paused');
    expect(paint).toHaveBeenLastCalledWith({ index: 1, elapsed: 0 });
    expect(frames.size).toBe(0);
  });
});
