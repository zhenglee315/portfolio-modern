import { useEffect, useRef, useState } from 'react';
import { reducedMotionQuery, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useDocumentVisible } from '@/shared/hooks/useDocumentVisible';
import type { JourneyStop } from '../schemas/journey';
import {
  advancePlayback,
  playbackSnapshot,
  type PlaybackClock,
  type PlaybackPhase,
} from '../model/playback';

/** Own one cancellable rAF clock; per-frame progress paints SVG without React rerenders.
 * Selection changes once per chapter; document or page suspension preserves elapsed time.
 */
export function useJourneyPlayback(
  items: JourneyStop[],
  selectedId: number,
  onSelect: (id: number) => void,
  paint: (clock: PlaybackClock) => void,
  suspended = false,
) {
  const reduced = useMediaQuery(reducedMotionQuery);
  const visible = useDocumentVisible();
  const [playing, setPlaying] = useState(true);
  const [phase, setPhase] = useState<PlaybackPhase>('holding');
  const clock = useRef<PlaybackClock>({ index: 0, elapsed: 0 });
  const effective = playing && visible && !reduced && !suspended && items.length > 1;
  useEffect(() => {
    const index = Math.max(
      0,
      items.findIndex((item) => item.id === selectedId),
    );
    if (clock.current.index !== index) clock.current = { index, elapsed: 0 };
    if (suspended) return;
    let frame = 0,
      last = 0,
      stopped = false;
    let lastPhase: PlaybackPhase | undefined;
    const tick = (now: number) => {
      if (stopped) return;
      const previous = clock.current;
      const next = effective
        ? advancePlayback(previous, last ? Math.min(80, now - last) : 0, items.length)
        : previous;
      last = now;
      clock.current = next;
      paint(next);
      const nextPhase = effective ? playbackSnapshot(next, items.length).phase : 'paused';
      if (nextPhase !== lastPhase) {
        lastPhase = nextPhase;
        setPhase(nextPhase);
      }
      if (next.index !== previous.index && items[next.index]) onSelect(items[next.index]!.id);
      if (effective) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [items, selectedId, onSelect, paint, effective, suspended]);
  const select = (id: number) => {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return;
    clock.current = { index, elapsed: 0 };
    setPlaying(false);
    setPhase('paused');
    onSelect(id);
    paint(clock.current);
  };
  const restart = () => {
    clock.current = { index: 0, elapsed: 0 };
    setPlaying(!reduced);
    if (items[0]) onSelect(items[0].id);
    paint(clock.current);
  };
  return {
    playing: effective,
    phase: effective ? phase : 'paused',
    reduced,
    select,
    restart,
    toggle: () => setPlaying((value) => !value),
  };
}
