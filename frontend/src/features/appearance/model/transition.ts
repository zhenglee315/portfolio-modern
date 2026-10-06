import type { Theme } from './preferences';

/** Coordinate page-owned entrance preparation, replay and interruption without exposing page DOM. */
export type ThemeTransitionPhase = 'prepare' | 'replay' | 'cancel';

/** Share one finite breathing interval across the old-palette cover and new-palette reveal. */
export const themeTransitionTiming = {
  durationMs: 800,
  easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
} as const;

/** Coordinate document palette paint without remounting content or disturbing focused controls.
 * @param doc Mounted browser document; no browser APIs run during server rendering.
 * @param veilClass Feature-owned noninteractive cover, independent of page layout and focus.
 * @param notify Synchronous page coordination; prepare runs only while the cover is fully opaque.
 * @returns Latest-wins palette application and a cleanup method for provider unmount.
 */
export function createThemeTransition(
  doc: Document,
  veilClass: string,
  notify?: (phase: ThemeTransitionPhase) => void,
) {
  const root = doc.documentElement;
  let initialized = false,
    disposed = false,
    prepared = false,
    generation = 0,
    requested: Theme | undefined;
  let veil: HTMLDivElement | undefined, animation: Animation | undefined;

  /** Invalidate pending callbacks before releasing only this controller's visual resources. */
  const clear = () => {
    generation++;
    animation?.cancel();
    animation = undefined;
    veil?.remove();
    veil = undefined;
    delete root.dataset.themeTransition;
  };

  /** Release page preparation or an entrance that continues after its veil has disappeared. */
  const cancelReplay = () => {
    prepared = false;
    notify?.('cancel');
  };

  /** Animate a requested palette; first paint, hidden documents and reduced motion stay immediate. */
  const apply = (theme: Theme, animate: boolean) => {
    if (disposed) return;
    // Finish the current blend before showing only the latest queued selection; never drop mid-paint.
    if (animate && veil) {
      requested = theme;
      return;
    }
    clear();
    requested = theme;
    if (!initialized || !animate || root.dataset.theme === theme) {
      initialized = true;
      root.dataset.theme = theme;
      if (!animate) cancelReplay();
      return;
    }
    const ticket = generation;
    let painted = theme;
    const current = () => !disposed && ticket === generation;
    const commit = () => {
      if (current()) root.dataset.theme = painted;
    };
    const finish = () => {
      if (!current()) return;
      const next = requested;
      commit();
      clear();
      if (next && next !== painted) {
        apply(next, true);
      } else if (prepared) {
        prepared = false;
        notify?.('replay');
      }
    };
    /** Animation failures still commit the latest preference and synchronously restore readable content. */
    const fail = () => {
      if (!current()) return;
      if (requested) root.dataset.theme = requested;
      clear();
      cancelReplay();
    };
    root.dataset.themeTransition = 'veil';
    veil = doc.createElement('div');
    veil.className = veilClass;
    veil.dataset.themeVeil = 'true';
    veil.setAttribute('aria-hidden', 'true');
    // Cover with the existing palette's own background rather than an unrelated bright flash.
    veil.style.backgroundColor = doc.defaultView!.getComputedStyle(root).getPropertyValue('--bg');
    doc.body.append(veil);
    if (typeof veil.animate !== 'function') {
      fail();
      return;
    }
    const surface = veil;
    const options: KeyframeAnimationOptions = {
      duration: themeTransitionTiming.durationMs / 2,
      easing: themeTransitionTiming.easing,
      fill: 'forwards',
    };
    try {
      animation = surface.animate([{ opacity: 0 }, { opacity: 1 }], options);
      void animation.finished
        .then(() => {
          if (!current()) return;
          // Commit only under a fully opaque veil, then reveal the new palette with the same easing.
          painted = requested ?? theme;
          if (root.dataset.theme !== painted && !prepared) {
            prepared = true;
            notify?.('prepare');
          }
          if (!current()) return;
          commit();
          const covering = animation;
          animation = surface.animate([{ opacity: 1 }, { opacity: 0 }], options);
          covering?.cancel();
          return animation.finished.then(finish);
        })
        .catch(fail);
    } catch {
      fail();
    }
  };

  /** Finish the latest selected palette and prevent skipped callbacks from applying stale colors. */
  const dispose = () => {
    if (disposed) return;
    if (requested) root.dataset.theme = requested;
    disposed = true;
    clear();
    cancelReplay();
  };
  return { apply, dispose };
}
