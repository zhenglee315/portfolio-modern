import { StrictMode, useRef } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThemeTransitionPhase } from '@/features/appearance';
import { createEntrance, entranceTiming } from '@/pages/portfolio/model/entrance';
import { useEntrance } from '@/pages/portfolio/hooks/useEntrance';

afterEach(() => vi.useRealTimers());

/** Exercise owner lifecycle events without replacing the production entrance controller. */
function themeEvents() {
  const listeners = new Set<(phase: ThemeTransitionPhase) => void>();
  return {
    subscribe: (listener: (phase: ThemeTransitionPhase) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit: (phase: ThemeTransitionPhase) => listeners.forEach((listener) => listener(phase)),
    count: () => listeners.size,
  };
}

describe('reusable page entrance lifecycle', () => {
  it('holds preparation until visible, coalesces repeat preparation and releases one finite run', () => {
    vi.useFakeTimers();
    const surface = document.createElement('div');
    const controller = createEntrance(surface);
    const done = vi.fn();
    controller.prepare();
    controller.prepare();
    expect(surface).toHaveAttribute('data-entering', 'true');
    expect(surface.style.getPropertyValue('--entrance-play-state')).toBe('paused');
    vi.advanceTimersByTime(entranceTiming.durationMs * 2);
    expect(surface).toHaveAttribute('data-entering', 'true');
    controller.play(done);
    controller.play(done);
    expect(surface.style.getPropertyValue('--entrance-play-state')).toBe('running');
    vi.advanceTimersByTime(entranceTiming.durationMs - 1);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledOnce();
    expect(surface).not.toHaveAttribute('data-entering');
    expect(surface.style.getPropertyValue('--entrance-play-state')).toBe('');
    controller.dispose();
  });

  it('replaces an active replay without allowing its older completion callback to run', () => {
    vi.useFakeTimers();
    const surface = document.createElement('div');
    const controller = createEntrance(surface);
    const previous = vi.fn();
    const latest = vi.fn();
    controller.prepare();
    controller.play(previous);
    vi.advanceTimersByTime(800);
    controller.prepare();
    controller.play(latest);
    vi.advanceTimersByTime(600);
    expect(previous).not.toHaveBeenCalled();
    expect(latest).not.toHaveBeenCalled();
    expect(surface).toHaveAttribute('data-entering', 'true');
    vi.advanceTimersByTime(800);
    expect(latest).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('cancels held and playing phases and prevents disposed owners from clearing a later marker', () => {
    vi.useFakeTimers();
    const surface = document.createElement('div');
    const controller = createEntrance(surface);
    const done = vi.fn();
    controller.prepare();
    controller.cancel();
    expect(surface).not.toHaveAttribute('data-entering');
    controller.prepare();
    controller.play(done);
    controller.dispose();
    surface.setAttribute('data-entering', 'true');
    surface.style.setProperty('--entrance-play-state', 'paused');
    controller.cancel();
    controller.play(done);
    vi.advanceTimersByTime(entranceTiming.durationMs * 2);
    expect(done).not.toHaveBeenCalled();
    expect(surface).toHaveAttribute('data-entering', 'true');
    expect(surface.style.getPropertyValue('--entrance-play-state')).toBe('paused');
  });

  it('reuses one hook for startup and theme replay without offering contact again or replacing content', () => {
    vi.useFakeTimers();
    const events = themeEvents();
    const reveal = vi.fn();
    function Page() {
      const root = useRef<HTMLDivElement>(null);
      useEntrance(root, true, reveal, false, events.subscribe);
      return (
        <div ref={root} data-testid="frame">
          <input defaultValue="Preserved draft" />
        </div>
      );
    }
    const view = render(
      <StrictMode>
        <Page />
      </StrictMode>,
    );
    const surface = view.getByTestId('frame');
    const input = view.getByRole('textbox');
    expect(events.count()).toBe(1);
    act(() => vi.advanceTimersByTime(entranceTiming.durationMs));
    expect(reveal).toHaveBeenCalledOnce();
    input.focus();
    act(() => events.emit('prepare'));
    expect(surface.style.getPropertyValue('--entrance-play-state')).toBe('paused');
    act(() => events.emit('replay'));
    act(() => vi.advanceTimersByTime(entranceTiming.durationMs));
    expect(reveal).toHaveBeenCalledOnce();
    expect(view.getByRole('textbox')).toBe(input);
    expect(input).toHaveFocus();
    expect(surface).not.toHaveAttribute('data-entering');
    view.unmount();
    expect(events.count()).toBe(0);
  });

  it('keeps finite theme feedback when startup is paused and never restarts from late API readiness', () => {
    vi.useFakeTimers();
    const events = themeEvents();
    const reveal = vi.fn();
    function Page({ ready }: { ready: boolean }) {
      const root = useRef<HTMLDivElement>(null);
      useEntrance(root, ready, reveal, true, events.subscribe);
      return <div ref={root} data-testid="frame" />;
    }
    const view = render(<Page ready={false} />);
    const surface = view.getByTestId('frame');
    expect(surface).not.toHaveAttribute('data-entering');
    act(() => events.emit('prepare'));
    act(() => events.emit('replay'));
    expect(surface.style.getPropertyValue('--entrance-play-state')).toBe('running');
    view.rerender(<Page ready />);
    expect(reveal).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(entranceTiming.durationMs));
    expect(reveal).toHaveBeenCalledOnce();
    expect(surface).not.toHaveAttribute('data-entering');
  });

  it('restores readable styles when a theme is cancelled during preparation or playback', () => {
    vi.useFakeTimers();
    const events = themeEvents();
    const reveal = vi.fn();
    function Page() {
      const root = useRef<HTMLDivElement>(null);
      useEntrance(root, true, reveal, true, events.subscribe);
      return <div ref={root} data-testid="frame" />;
    }
    const view = render(<Page />);
    const surface = view.getByTestId('frame');
    for (const play of [false, true]) {
      act(() => events.emit('prepare'));
      if (play) act(() => events.emit('replay'));
      act(() => events.emit('cancel'));
      expect(surface).not.toHaveAttribute('data-entering');
      expect(surface.style.getPropertyValue('--entrance-play-state')).toBe('');
      act(() => vi.advanceTimersByTime(entranceTiming.durationMs));
    }
    expect(reveal).toHaveBeenCalledOnce();
  });
});
