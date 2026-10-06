import { afterEach, describe, expect, it, vi } from 'vitest';
import { createThemeTransition } from '@/features/appearance/model/transition';

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
    root.dataset.theme = 'blue';
    const controller = createThemeTransition(document, 'test-veil');
    controller.apply('blue', true);
    controller.apply('blue', true);
    expect(animate).not.toHaveBeenCalled();
    expect(root.dataset.theme).toBe('blue');
    expect(document.querySelector('[data-theme-veil]')).toBeNull();
    controller.dispose();
  });

  it('coalesces rapid choices under the same cover and reveals only the latest selection', async () => {
    const { calls } = controlledAnimations();
    const controller = createThemeTransition(document, 'test-veil');
    controller.apply('mist', true);
    controller.apply('mint', true);
    const cover = document.querySelector('[data-theme-veil]');
    controller.apply('blue', true);
    controller.apply('amber', true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cancel).not.toHaveBeenCalled();
    expect(document.querySelector('[data-theme-veil]')).toBe(cover);
    expect(root.dataset.theme).toBe('mist');
    calls[0]!.finished.resolve();
    await Promise.resolve();
    expect(calls).toHaveLength(2);
    expect(root.dataset.theme).toBe('amber');
    expect(document.querySelector('[data-theme-veil]')).toBe(cover);
    calls[1]!.finished.resolve();
    await Promise.resolve();
    expect(root.dataset.themeTransition).toBeUndefined();
    expect(document.querySelector('[data-theme-veil]')).toBeNull();
    expect(root.dataset.theme).toBe('amber');
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
    const controller = createThemeTransition(document, 'test-veil');
    controller.apply('mist', true);
    controller.apply('amber', true);
    calls[0]!.finished.reject(new Error('Animation cancelled'));
    await Promise.resolve();
    await Promise.resolve();
    expect(root.dataset.theme).toBe('amber');
    expect(root.dataset.themeTransition).toBeUndefined();
    expect(document.querySelector('[data-theme-veil]')).toBeNull();
    controller.dispose();
  });
});
