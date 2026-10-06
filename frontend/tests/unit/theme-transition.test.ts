import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  createThemeTransition,
  type ThemeTransitionPhase,
} from '@/features/appearance/model/transition';
import { useThemeTransition } from '@/features/appearance/hooks/useThemeTransition';
import type { Theme } from '@/features/appearance';

/** Hold a browser animation promise independently of cancellation to exercise late completion races. */
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
const root = document.documentElement;
afterEach(() => {
  if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate);
  else Reflect.deleteProperty(Element.prototype, 'animate');
  delete root.dataset.theme;
  delete root.dataset.themeTransition;
  document.querySelectorAll('[data-theme-veil]').forEach((node) => node.remove());
});

/** Replace only the browser animation boundary; the real controller retains DOM and palette ownership. */
function controlledAnimations() {
  const calls: { finished: ReturnType<typeof deferred>; cancel: ReturnType<typeof vi.fn> }[] = [];
  const animate = vi.fn(() => {
    const call = { finished: deferred(), cancel: vi.fn() };
    calls.push(call);
    return { finished: call.finished.promise, cancel: call.cancel } as unknown as Animation;
  });
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  return { calls, animate };
}

describe('palette transition ownership', () => {
  it('keeps restored first paint and same-palette selection immediate without creating a cover', () => {
    const { animate } = controlledAnimations();
    const notify = vi.fn();
    root.dataset.theme = 'blue';
    const controller = createThemeTransition(document, 'test-veil', notify);
    controller.apply('blue', true);
    controller.apply('blue', true);
    expect(animate).not.toHaveBeenCalled();
    expect(root.dataset.theme).toBe('blue');
    expect(document.querySelector('[data-theme-veil]')).toBeNull();
    expect(notify).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('coalesces rapid choices under the same cover and reveals only the latest selection', async () => {
    const { calls } = controlledAnimations();
    const phases: ThemeTransitionPhase[] = [];
    const controller = createThemeTransition(document, 'test-veil', (phase) => {
      phases.push(phase);
      if (phase === 'prepare') {
        expect(root.dataset.theme).toBe('mist');
        expect(document.querySelector('[data-theme-veil]')).not.toBeNull();
      }
      if (phase === 'replay') expect(document.querySelector('[data-theme-veil]')).toBeNull();
    });
    controller.apply('mist', true);
    controller.apply('mint', true);
    const cover = document.querySelector('[data-theme-veil]');
    controller.apply('blue', true);
    controller.apply('amber', true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cancel).not.toHaveBeenCalled();
    expect(document.querySelector('[data-theme-veil]')).toBe(cover);
    expect(root.dataset.theme).toBe('mist');
    expect(phases).toEqual([]);
    calls[0]!.finished.resolve();
    await Promise.resolve();
    expect(calls).toHaveLength(2);
    expect(root.dataset.theme).toBe('amber');
    expect(document.querySelector('[data-theme-veil]')).toBe(cover);
    expect(phases).toEqual(['prepare']);
    calls[1]!.finished.resolve();
    await Promise.resolve();
    expect(root.dataset.themeTransition).toBeUndefined();
    expect(document.querySelector('[data-theme-veil]')).toBeNull();
    expect(root.dataset.theme).toBe('amber');
    expect(phases).toEqual(['prepare', 'replay']);
    controller.dispose();
  });

  it('commits an immediate accessibility change and prevents late completion after dispose', async () => {
    const { calls } = controlledAnimations();
    const controller = createThemeTransition(document, 'test-veil');
    controller.apply('mist', true);
    controller.apply('blue', true);
    controller.apply('mint', false);
    calls[0]!.finished.resolve();
    await Promise.resolve();
    expect(root.dataset.theme).toBe('mint');
    expect(root.dataset.themeTransition).toBeUndefined();
    expect(calls).toHaveLength(1);
    controller.apply('amber', true);
    controller.dispose();
    calls[1]!.finished.resolve();
    await Promise.resolve();
    controller.apply('blue', true);
    expect(root.dataset.theme).toBe('amber');
    expect(root.dataset.themeTransition).toBeUndefined();
    expect(document.querySelector('[data-theme-veil]')).toBeNull();
  });

  it('retains the selected palette and releases its cover when a browser animation rejects', async () => {
    const { calls } = controlledAnimations();
    const notify = vi.fn();
    const controller = createThemeTransition(document, 'test-veil', notify);
    controller.apply('mist', true);
    controller.apply('amber', true);
    controller.apply('blue', true);
    calls[0]!.finished.reject(new Error('Animation cancelled'));
    await Promise.resolve();
    await Promise.resolve();
    expect(root.dataset.theme).toBe('blue');
    expect(root.dataset.themeTransition).toBeUndefined();
    expect(document.querySelector('[data-theme-veil]')).toBeNull();
    expect(notify.mock.calls).toEqual([['cancel']]);
    controller.dispose();
  });

  it('keeps preparation across reveal-time choices and replays once after the latest palette', async () => {
    const { calls } = controlledAnimations();
    const phases: ThemeTransitionPhase[] = [];
    const controller = createThemeTransition(document, 'test-veil', (phase) => phases.push(phase));
    controller.apply('mist', true);
    controller.apply('blue', true);
    calls[0]!.finished.resolve();
    await Promise.resolve();
    expect(phases).toEqual(['prepare']);
    expect(root.dataset.theme).toBe('blue');
    controller.apply('mint', true);
    calls[1]!.finished.resolve();
    await Promise.resolve();
    expect(calls).toHaveLength(3);
    expect(phases).toEqual(['prepare']);
    controller.apply('amber', true);
    calls[2]!.finished.resolve();
    await Promise.resolve();
    expect(root.dataset.theme).toBe('amber');
    expect(phases).toEqual(['prepare']);
    calls[3]!.finished.resolve();
    await Promise.resolve();
    expect(phases).toEqual(['prepare', 'replay']);
    expect(root.dataset.themeTransition).toBeUndefined();
    expect(document.querySelector('[data-theme-veil]')).toBeNull();
    controller.dispose();
  });

  it('does not replay when rapid cover-time choices return to the currently painted palette', async () => {
    const { calls } = controlledAnimations();
    const notify = vi.fn();
    const controller = createThemeTransition(document, 'test-veil', notify);
    controller.apply('mist', true);
    controller.apply('blue', true);
    controller.apply('mist', true);
    calls[0]!.finished.resolve();
    await Promise.resolve();
    calls[1]!.finished.resolve();
    await Promise.resolve();
    expect(root.dataset.theme).toBe('mist');
    expect(notify).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('cancels a page replay when motion is reduced or hidden after its cover has already finished', async () => {
    const { calls } = controlledAnimations();
    const phases: ThemeTransitionPhase[] = [];
    const controller = createThemeTransition(document, 'test-veil', (phase) => phases.push(phase));
    controller.apply('mist', true);
    controller.apply('blue', true);
    calls[0]!.finished.resolve();
    await Promise.resolve();
    calls[1]!.finished.resolve();
    await Promise.resolve();
    controller.apply('blue', false);
    expect(phases).toEqual(['prepare', 'replay', 'cancel']);
    controller.apply('blue', true);
    expect(calls).toHaveLength(2);
    expect(phases).toEqual(['prepare', 'replay', 'cancel']);
    controller.dispose();
    expect(phases).toEqual(['prepare', 'replay', 'cancel', 'cancel']);
  });

  it('cancels prepared content and commits the latest queued theme when reveal rejects', async () => {
    const { calls } = controlledAnimations();
    const phases: ThemeTransitionPhase[] = [];
    const controller = createThemeTransition(document, 'test-veil', (phase) => phases.push(phase));
    controller.apply('mist', true);
    controller.apply('blue', true);
    calls[0]!.finished.resolve();
    await Promise.resolve();
    controller.apply('amber', true);
    await act(async () => calls[1]!.finished.reject(new Error('Reveal interrupted')));
    expect(root.dataset.theme).toBe('amber');
    expect(phases).toEqual(['prepare', 'cancel']);
    expect(root.dataset.themeTransition).toBeUndefined();
    expect(document.querySelector('[data-theme-veil]')).toBeNull();
    expect(calls).toHaveLength(2);
    controller.dispose();
  });

  it('cancels prepared content synchronously without letting a late reveal restart it', async () => {
    const { calls } = controlledAnimations();
    const phases: ThemeTransitionPhase[] = [];
    const controller = createThemeTransition(document, 'test-veil', (phase) => phases.push(phase));
    controller.apply('mist', true);
    controller.apply('blue', true);
    calls[0]!.finished.resolve();
    await Promise.resolve();
    controller.apply('amber', false);
    expect(root.dataset.theme).toBe('amber');
    expect(phases).toEqual(['prepare', 'cancel']);
    calls[1]!.finished.resolve();
    await Promise.resolve();
    expect(phases).toEqual(['prepare', 'cancel']);
    expect(calls).toHaveLength(2);
    controller.dispose();
  });

  it('finishes readable content immediately if browser animation is unsupported or throws', () => {
    const notify = vi.fn();
    Reflect.deleteProperty(Element.prototype, 'animate');
    const controller = createThemeTransition(document, 'test-veil', notify);
    controller.apply('mist', true);
    controller.apply('blue', true);
    expect(root.dataset.theme).toBe('blue');
    expect(notify.mock.calls).toEqual([['cancel']]);
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: () => {
        throw new Error('Animation unavailable');
      },
    });
    controller.apply('amber', true);
    expect(root.dataset.theme).toBe('amber');
    expect(notify.mock.calls).toEqual([['cancel'], ['cancel']]);
    expect(root.dataset.themeTransition).toBeUndefined();
    expect(document.querySelector('[data-theme-veil]')).toBeNull();
    controller.dispose();
  });

  it('does not commit or animate after synchronous disposal from a preparation listener', async () => {
    const { calls } = controlledAnimations();
    const phases: ThemeTransitionPhase[] = [];
    const controller = createThemeTransition(document, 'test-veil', (phase) => {
      phases.push(phase);
      if (phase === 'prepare') controller.dispose();
    });
    controller.apply('mist', true);
    controller.apply('blue', true);
    calls[0]!.finished.resolve();
    await Promise.resolve();
    expect(root.dataset.theme).toBe('blue');
    expect(phases).toEqual(['prepare', 'cancel']);
    expect(calls).toHaveLength(1);
    expect(root.dataset.themeTransition).toBeUndefined();
    expect(document.querySelector('[data-theme-veil]')).toBeNull();
  });
});

describe('palette transition subscriptions', () => {
  it.each([
    { reason: 'reduced motion', reduced: true, visible: true },
    { reason: 'document visibility', reduced: false, visible: false },
  ])('retains one stable subscription and controller across $reason changes', async (policy) => {
    const { calls } = controlledAnimations();
    const view = renderHook(
      ({ theme, reduced, visible }: { theme: Theme; reduced: boolean; visible: boolean }) =>
        useThemeTransition(theme, reduced, visible),
      { initialProps: { theme: 'mist', reduced: false, visible: true } },
    );
    const subscribe = view.result.current;
    const notify = vi.fn();
    subscribe(notify);
    view.rerender({ theme: 'blue', reduced: false, visible: true });
    expect(view.result.current).toBe(subscribe);
    await act(async () => calls[0]!.finished.resolve());
    expect(notify.mock.calls).toEqual([['prepare']]);
    view.rerender({ theme: 'amber', reduced: false, visible: true });
    expect(calls).toHaveLength(2);
    view.rerender({ theme: 'amber', reduced: policy.reduced, visible: policy.visible });
    expect(view.result.current).toBe(subscribe);
    expect(notify.mock.calls).toEqual([['prepare'], ['cancel']]);
    expect(root.dataset.theme).toBe('amber');
    view.rerender({ theme: 'amber', reduced: false, visible: true });
    expect(calls).toHaveLength(2);
    view.unmount();
    expect(notify.mock.calls).toEqual([['prepare'], ['cancel'], ['cancel']]);
  });

  it('unsubscribes only its owner and lets a removed page ignore queued animation completion', async () => {
    const { calls } = controlledAnimations();
    const view = renderHook(
      ({ theme }: { theme: Theme }) => useThemeTransition(theme, false, true),
      {
        initialProps: { theme: 'mist' },
      },
    );
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = view.result.current(first);
    view.result.current(second);
    view.rerender({ theme: 'blue' });
    await act(async () => calls[0]!.finished.resolve());
    unsubscribe();
    await act(async () => calls[1]!.finished.resolve());
    expect(first.mock.calls).toEqual([['prepare']]);
    expect(second.mock.calls).toEqual([['prepare'], ['replay']]);
    view.unmount();
    expect(first.mock.calls).toEqual([['prepare']]);
    expect(second.mock.calls).toEqual([['prepare'], ['replay'], ['cancel']]);
  });
});
