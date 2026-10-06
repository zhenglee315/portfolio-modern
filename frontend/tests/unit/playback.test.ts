import { describe, expect, it } from 'vitest';
import { advancePlayback, playbackSnapshot } from '@/features/journey/model/playback';

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
