export const journeyTiming = { flight: 5200, hold: 1500, arrival: 500, finalHold: 3000 };
export type PlaybackClock = { index: number; elapsed: number };
export type PlaybackPhase = 'holding' | 'flying' | 'final-hold' | 'paused';

/** Derive chapter progress and its painted arrival destination.
 * The final 500ms highlights the destination while the source chapter remains selected.
 * A final chapter has no invented last-to-first flight.
 */
export function playbackSnapshot(clock: PlaybackClock, count: number) {
  const last = clock.index >= count - 1;
  const progress = last
    ? 0
    : Math.max(0, Math.min(1, (clock.elapsed - journeyTiming.hold) / journeyTiming.flight));
  const phase: PlaybackPhase = last
    ? 'final-hold'
    : clock.elapsed < journeyTiming.hold || progress === 1
      ? 'holding'
      : 'flying';
  const highlightedIndex = !last && progress === 1 ? clock.index + 1 : clock.index;
  return { ...clock, phase, progress, last, highlightedIndex };
}

/** Advance an explicit clock through hold, flight, arrival and final-loop rest.
 * @param delta Visible elapsed milliseconds; complete cycles are reduced arithmetically.
 */
export function advancePlayback(clock: PlaybackClock, delta: number, count: number): PlaybackClock {
  if (count < 1) return { index: 0, elapsed: 0 };
  const step = journeyTiming.hold + journeyTiming.flight + journeyTiming.arrival;
  const cycle = Math.max(1, (count - 1) * step + journeyTiming.finalHold);
  let index = Math.min(count - 1, Math.max(0, clock.index));
  let elapsed = clock.elapsed + Math.max(0, Number.isFinite(delta) ? delta % cycle : 0);
  for (;;) {
    const limit = index === count - 1 ? journeyTiming.finalHold : step;
    if (elapsed < limit) return { index, elapsed };
    elapsed -= limit;
    index = (index + 1) % count;
  }
}
