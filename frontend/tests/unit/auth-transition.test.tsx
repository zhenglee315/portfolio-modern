import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authTransitionTiming,
  createAuthTransition,
} from '@/pages/portfolio/model/auth-transition';
import { useAuthTransition } from '@/pages/portfolio/hooks/useAuthTransition';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('page-owned auth transition', () => {
  it('finishes every visual phase in order and locks repeated login clicks', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const player = createAuthTransition(changed);
    expect(player.open()).toBe(true);
    expect(player.open()).toBe(false);
    expect(player.getPhase()).toBe('exit');
    for (const [phase, next] of [
      ['exit', 'collide'],
      ['collide', 'expand'],
      ['expand', 'reveal'],
      ['reveal', 'auth'],
    ] as const) {
      vi.advanceTimersByTime(authTransitionTiming[phase] - 1);
      expect(player.getPhase()).toBe(phase);
      vi.advanceTimersByTime(1);
      expect(player.getPhase()).toBe(next);
      expect(player.open()).toBe(false);
    }
    expect(changed.mock.calls.map(([phase]) => phase)).toEqual([
      'exit',
      'collide',
      'expand',
      'reveal',
      'auth',
    ]);
    expect(vi.getTimerCount()).toBe(0);
    player.dispose();
  });

  it('returns during a collision and never lets its old deadline advance a later open', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const player = createAuthTransition(changed);
    player.open();
    vi.advanceTimersByTime(authTransitionTiming.exit + 100);
    expect(player.getPhase()).toBe('collide');
    expect(player.back()).toBe(true);
    expect(player.back()).toBe(false);
    expect(player.open()).toBe(true);
    vi.advanceTimersByTime(authTransitionTiming.collide - 100);
    expect(player.getPhase()).toBe('exit');
    vi.advanceTimersByTime(authTransitionTiming.exit - (authTransitionTiming.collide - 100));
    expect(player.getPhase()).toBe('collide');
    player.dispose();
    const calls = changed.mock.calls.length;
    vi.runAllTimers();
    expect(changed).toHaveBeenCalledTimes(calls);
    expect(player.open()).toBe(false);
  });

  it('settles a motion interruption immediately without a delayed reveal or replay', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const player = createAuthTransition(changed);
    player.open();
    vi.advanceTimersByTime(authTransitionTiming.exit);
    player.finish();
    player.finish();
    expect(player.getPhase()).toBe('auth');
    vi.runAllTimers();
    expect(changed.mock.calls.map(([phase]) => phase)).toEqual(['exit', 'collide', 'auth']);
    player.back();
    player.open(true);
    expect(player.getPhase()).toBe('auth');
    expect(vi.getTimerCount()).toBe(0);
    player.dispose();
  });

  it('keeps stable owner callbacks, suspends midflight and restores the previous scroll', () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const scrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 680 });
    try {
      const view = renderHook(({ paused }) => useAuthTransition(paused), {
        initialProps: { paused: false },
        wrapper: StrictMode,
      });
      const { open, back } = view.result.current;
      act(open);
      expect(view.result.current.isAuth).toBe(true);
      expect(view.result.current.busy).toBe(true);
      view.rerender({ paused: true });
      expect(view.result.current.phase).toBe('auth');
      expect(view.result.current.busy).toBe(false);
      expect(view.result.current.style).toEqual({
        '--auth-exit-duration': '0ms',
        '--auth-collide-duration': '0ms',
        '--auth-expand-duration': '0ms',
        '--auth-reveal-duration': '0ms',
      });
      expect(view.result.current.open).toBe(open);
      expect(view.result.current.back).toBe(back);
      expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 0, behavior: 'instant' });
      act(back);
      expect(view.result.current.phase).toBe('portfolio');
      act(() => vi.advanceTimersByTime(20));
      expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 680, behavior: 'instant' });
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      if (scrollY) Object.defineProperty(window, 'scrollY', scrollY);
    }
  });

  it('finishes when hidden and releases its deadline and visibility listener on unmount', () => {
    vi.useFakeTimers();
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const view = renderHook(() => useAuthTransition(false));
    act(view.result.current.open);
    hidden = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(view.result.current.phase).toBe('auth');
    expect(vi.getTimerCount()).toBe(0);
    hidden = false;
    act(view.result.current.back);
    act(view.result.current.open);
    expect(view.result.current.phase).toBe('exit');
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(0);
  });
});
