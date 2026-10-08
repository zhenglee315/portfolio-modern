import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCowWorkspaceMotion,
  type CowWorkspaceMotionOptions,
} from '@/shared/hooks/useCowWorkspaceMotion';

class MediaPreference extends EventTarget {
  constructor(public matches: boolean) {
    super();
  }

  change(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(new Event('change'));
  }
}

class ViewportObserver {
  disconnect = vi.fn();
  observe = vi.fn();

  constructor(private callback: IntersectionObserverCallback) {
    observers.push(this);
  }

  show(visible: boolean) {
    this.callback(
      [{ isIntersecting: visible } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

class TestPointerEvent extends MouseEvent {
  readonly pointerType: string;

  constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

let media: Map<string, MediaPreference>;
let observers: ViewportObserver[];
let frames: Map<number, FrameRequestCallback>;

function Harness({ onRender, ...options }: CowWorkspaceMotionOptions & { onRender?: () => void }) {
  const interaction = useCowWorkspaceMotion(options);
  onRender?.();
  return <div {...interaction} role="img" aria-label="Cow workspace" />;
}

function preference(query: string) {
  const value = media.get(query);
  if (!value) throw new Error(`Unregistered preference: ${query}`);
  return value;
}

function advanceFrames(count = 60) {
  act(() => {
    for (let index = 0; index < count; index += 1) {
      vi.advanceTimersByTime(16);
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(performance.now());
    }
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  media = new Map();
  observers = [];
  frames = new Map();
  let nextFrame = 0;
  vi.stubGlobal('IntersectionObserver', ViewportObserver);
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const value = new MediaPreference(query.includes('pointer: fine'));
    media.set(query, value);
    return value as unknown as MediaQueryList;
  });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 100,
    y: 100,
    top: 100,
    left: 100,
    bottom: 500,
    right: 500,
    width: 400,
    height: 400,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.motionPaused;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('cow workspace motion lifecycle', () => {
  it('renders on the server without browser globals or a session provider', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);
    try {
      expect(renderToString(<Harness />)).toContain('aria-label="Cow workspace"');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('eases pointer depth without rerendering and settles back to neutral on leave', () => {
    const onRender = vi.fn();
    const view = render(<Harness onRender={onRender} phase="typing" />);
    const surface = view.getByRole('img');
    const initialRenderCount = onRender.mock.calls.length;
    fireEvent.pointerMove(surface, { clientX: 500, clientY: 100 });
    advanceFrames();
    expect(Number(surface.style.getPropertyValue('--cow-pointer-x'))).toBeGreaterThan(0.95);
    expect(Number(surface.style.getPropertyValue('--cow-pointer-y'))).toBeLessThan(-0.95);
    expect(onRender).toHaveBeenCalledTimes(initialRenderCount);
    fireEvent.pointerLeave(surface);
    advanceFrames();
    expect(Number(surface.style.getPropertyValue('--cow-pointer-x'))).toBe(0);
    expect(Number(surface.style.getPropertyValue('--cow-pointer-y'))).toBe(0);
    expect(frames.size).toBe(0);
    expect(onRender).toHaveBeenCalledTimes(initialRenderCount);
  });

  it('neutralizes active pointer motion immediately when reduced motion is requested', () => {
    const view = render(<Harness />);
    const surface = view.getByRole('img');
    fireEvent.pointerMove(surface, { clientX: 500, clientY: 100 });
    advanceFrames(8);
    expect(Number(surface.style.getPropertyValue('--cow-pointer-x'))).toBeGreaterThan(0);
    act(() => preference('(prefers-reduced-motion: reduce)').change(true));
    const heldPhase = surface.dataset.cowPhase;
    expect(surface).toHaveAttribute('data-cow-motion', 'paused');
    expect(Number(surface.style.getPropertyValue('--cow-pointer-x'))).toBe(0);
    expect(frames.size).toBe(0);
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 500 });
    fireEvent.pointerDown(surface);
    act(() => vi.advanceTimersByTime(30000));
    expect(surface.dataset.cowPhase).toBe(heldPhase);
    expect(Number(surface.style.getPropertyValue('--cow-pointer-x'))).toBe(0);
  });

  it('preserves an explicitly selected typing pose during ambient time and interaction', () => {
    const view = render(<Harness phase="typing" />);
    const surface = view.getByRole('img');
    expect(surface).toHaveAttribute('data-cow-motion', 'active');
    fireEvent.pointerDown(surface);
    fireEvent.pointerMove(surface, { clientX: 350, clientY: 300 });
    act(() => vi.advanceTimersByTime(60000));
    expect(surface).toHaveAttribute('data-cow-phase', 'typing');
    expect(vi.getTimerCount()).toBe(0);
    view.rerender(<Harness phase="glance" />);
    expect(surface).toHaveAttribute('data-cow-phase', 'glance');
    view.rerender(<Harness />);
    expect(surface).toHaveAttribute('data-cow-phase', 'thinking');
  });

  it('offers brief eye contact on interaction and then returns to thinking', () => {
    const view = render(<Harness />);
    const surface = view.getByRole('img');
    fireEvent.pointerDown(surface);
    expect(surface).toHaveAttribute('data-cow-phase', 'glance');
    act(() => vi.advanceTimersByTime(3000));
    expect(surface).toHaveAttribute('data-cow-phase', 'thinking');
  });

  it('honors the page motion toggle and resumes its held phase after the pause', async () => {
    const view = render(<Harness />);
    const surface = view.getByRole('img');
    expect(surface).toHaveAttribute('data-cow-motion', 'active');
    await act(async () => {
      document.documentElement.dataset.motionPaused = 'true';
    });
    const heldPhase = surface.dataset.cowPhase;
    expect(surface).toHaveAttribute('data-cow-motion', 'paused');
    act(() => vi.advanceTimersByTime(30000));
    expect(surface.dataset.cowPhase).toBe(heldPhase);
    await act(async () => {
      document.documentElement.dataset.motionPaused = 'false';
    });
    expect(surface).toHaveAttribute('data-cow-motion', 'active');
    expect(surface.dataset.cowPhase).toBe(heldPhase);
    act(() => vi.advanceTimersByTime(8000));
    expect(surface.dataset.cowPhase).not.toBe(heldPhase);
  });

  it('preserves ambient typing and its remaining time across the motion prop pause', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const view = render(<Harness />);
    const surface = view.getByRole('img');
    act(() => vi.advanceTimersByTime(9000));
    expect(surface).toHaveAttribute('data-cow-phase', 'typing');
    view.rerender(<Harness motion={false} />);
    expect(surface).toHaveAttribute('data-cow-motion', 'paused');
    expect(surface).toHaveAttribute('data-cow-phase', 'typing');
    act(() => vi.advanceTimersByTime(30000));
    expect(surface).toHaveAttribute('data-cow-phase', 'typing');
    view.rerender(<Harness motion />);
    expect(surface).toHaveAttribute('data-cow-motion', 'active');
    expect(surface).toHaveAttribute('data-cow-phase', 'typing');
    act(() => vi.advanceTimersByTime(1000));
    expect(surface).toHaveAttribute('data-cow-phase', 'typing');
    act(() => vi.advanceTimersByTime(1000));
    expect(surface).toHaveAttribute('data-cow-phase', 'glance');
  });

  it('preserves ambient pose and progress when the parallax preference changes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const view = render(<Harness />);
    const surface = view.getByRole('img');
    act(() => vi.advanceTimersByTime(9000));
    expect(surface).toHaveAttribute('data-cow-phase', 'typing');
    view.rerender(<Harness parallax={false} />);
    expect(surface).toHaveAttribute('data-cow-motion', 'active');
    expect(surface).toHaveAttribute('data-cow-phase', 'typing');
    act(() => vi.advanceTimersByTime(2000));
    expect(surface).toHaveAttribute('data-cow-phase', 'glance');
    view.rerender(<Harness parallax />);
    expect(surface).toHaveAttribute('data-cow-phase', 'glance');
  });

  it('leaves touch gestures usable and suspends ambient work when outside the viewport', () => {
    const view = render(<Harness />);
    const surface = view.getByRole('img');
    expect(
      fireEvent.pointerMove(surface, {
        clientX: 500,
        clientY: 100,
        pointerType: 'touch',
        cancelable: true,
      }),
    ).toBe(true);
    expect(frames.size).toBe(0);
    expect(Number(surface.style.getPropertyValue('--cow-pointer-x'))).toBe(0);
    act(() => observers[0]?.show(false));
    expect(surface).toHaveAttribute('data-cow-motion', 'paused');
    act(() => vi.advanceTimersByTime(30000));
    expect(surface).toHaveAttribute('data-cow-phase', 'thinking');
    expect(vi.getTimerCount()).toBe(0);
    act(() => observers[0]?.show(true));
    expect(surface).toHaveAttribute('data-cow-motion', 'active');
  });

  it('freezes hidden documents and ignores mouse depth when a fine pointer is unavailable', () => {
    const view = render(<Harness />);
    const surface = view.getByRole('img');
    act(() => preference('(hover: hover) and (pointer: fine)').change(false));
    fireEvent.pointerMove(surface, { clientX: 500, clientY: 100 });
    expect(frames.size).toBe(0);
    expect(Number(surface.style.getPropertyValue('--cow-pointer-x'))).toBe(0);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(surface).toHaveAttribute('data-cow-motion', 'paused');
    act(() => vi.advanceTimersByTime(30000));
    expect(surface).toHaveAttribute('data-cow-phase', 'thinking');
    expect(vi.getTimerCount()).toBe(0);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    expect(surface).toHaveAttribute('data-cow-motion', 'active');
  });

  it('cancels work on unmount and ignores stale viewport or frame notifications', () => {
    const view = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    const surface = view.getByRole('img');
    const observer = observers.at(-1);
    fireEvent.pointerMove(surface, { clientX: 500, clientY: 100 });
    const staleFrame = [...frames.values()][0];
    act(() => observer?.show(false));
    view.unmount();
    const stoppedStyle = surface.getAttribute('style');
    act(() => {
      observer?.show(true);
      staleFrame?.(performance.now());
      preference('(prefers-reduced-motion: reduce)').change(true);
      vi.advanceTimersByTime(30000);
    });
    expect(surface).toHaveAttribute('data-cow-motion', 'paused');
    expect(surface.getAttribute('style')).toBe(stoppedStyle);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(observers.every((item) => item.disconnect.mock.calls.length === 1)).toBe(true);
  });
});
