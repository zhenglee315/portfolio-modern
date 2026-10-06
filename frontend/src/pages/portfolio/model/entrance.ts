/** Keep one finite deadline for both the original entrance and palette-triggered replays. */
export const entranceTiming = { durationMs: 1400 } as const;

/** Control the existing page entrance without rebuilding content or owning business callbacks.
 * @param surface Mounted portfolio frame whose descendants consume the entrance marker.
 * @returns Preparation, playback and cleanup operations for one page-owned visual lifecycle.
 * Preparation holds the original CSS animations at their first frame until the palette is visible.
 */
export function createEntrance(surface: HTMLElement) {
  let phase: 'idle' | 'prepared' | 'playing' = 'idle';
  let disposed = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Invalidate the previous deadline and restore ordinary, readable component styles. */
  const clear = () => {
    generation++;
    clearTimeout(timer);
    timer = undefined;
    phase = 'idle';
    surface.removeAttribute('data-entering');
    surface.style.removeProperty('--entrance-play-state');
  };

  /** Prepare one sequence under the opaque palette veil; repeated preparation stays coalesced. */
  const prepare = () => {
    if (disposed || phase === 'prepared') return;
    clear();
    // Resolve removal before restoring the marker so an interrupted replay uses fresh CSS animations.
    void surface.offsetWidth;
    surface.style.setProperty('--entrance-play-state', 'paused');
    surface.setAttribute('data-entering', 'true');
    phase = 'prepared';
  };

  /** Release prepared CSS animations and complete exactly one finite sequence.
   * @param onComplete Optional owner callback; only the initial entrance supplies contact disclosure.
   * @param durationMs Remaining startup deadline or the complete replay interval.
   * Completion callbacks from cancelled, replaced or disposed runs cannot execute.
   */
  const play = (onComplete?: () => void, durationMs: number = entranceTiming.durationMs) => {
    if (disposed || phase !== 'prepared') return;
    phase = 'playing';
    surface.style.setProperty('--entrance-play-state', 'running');
    const ticket = generation;
    timer = setTimeout(
      () => {
        if (disposed || ticket !== generation) return;
        clear();
        onComplete?.();
      },
      Math.max(0, durationMs),
    );
  };

  /** Finish an accessibility/visibility interruption without firing the owner callback. */
  const cancel = () => {
    if (!disposed) clear();
  };

  /** Release this page's marker and deadline; subsequent calls cannot affect a later owner. */
  const dispose = () => {
    if (disposed) return;
    clear();
    disposed = true;
  };

  return { prepare, play, cancel, dispose };
}
