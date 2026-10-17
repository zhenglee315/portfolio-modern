import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSectionNavigation } from '@/pages/portfolio/hooks/useSectionNavigation';
import { sections } from '@/pages/portfolio/model/navigation';

describe('portfolio navigation suspension', () => {
  const frames = new Map<number, FrameRequestCallback>();
  const targets = new Map<string, HTMLElement>();
  let main: HTMLElement;
  let frameId = 0;
  const observers: { disconnect: ReturnType<typeof vi.fn> }[] = [];
  const step = () => {
    const pending = [...frames.values()];
    frames.clear();
    act(() => pending.forEach((callback) => callback(performance.now())));
  };

  beforeEach(() => {
    frames.clear();
    targets.clear();
    observers.length = 0;
    frameId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal(
      'ResizeObserver',
      class {
        disconnect = vi.fn();
        observe = vi.fn();
        constructor() {
          observers.push(this);
        }
      },
    );
    main = document.createElement('main');
    main.id = 'main-content';
    for (const [index, section] of sections.entries()) {
      const target = document.createElement('section');
      target.id = section.id;
      target.scrollIntoView = vi.fn();
      vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
        top: index < 2 ? index * 80 : 1000 + index * 80,
      } as DOMRect);
      targets.set(section.id, target);
      main.append(target);
    }
    document.body.append(main);
    history.replaceState({ routeMarker: 'preserved' }, '', '/en?source=auth#projects');
  });
  afterEach(() => {
    cleanup();
    main.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('disconnects while suspended and resumes active state without moving saved scroll', () => {
    const { result, rerender } = renderHook(({ enabled }) => useSectionNavigation('en', enabled), {
      initialProps: { enabled: true },
      wrapper: StrictMode,
    });
    step();
    expect(targets.get('projects')!.scrollIntoView).toHaveBeenCalledOnce();
    expect(result.current.active).toBe('projects');

    rerender({ enabled: false });
    expect(observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true);
    expect(frames.size).toBe(0);
    act(() => result.current.navigate('overview'));
    history.replaceState(history.state, '', '/en?source=auth&view=login#skills');
    for (const type of ['scroll', 'resize', 'hashchange', 'popstate', 'wheel'])
      act(() => window.dispatchEvent(new Event(type)));
    expect(frames.size).toBe(0);
    expect(targets.get('overview')!.scrollIntoView).not.toHaveBeenCalled();

    rerender({ enabled: true });
    step();
    expect(result.current.active).toBe('journey');
    expect(location.hash).toBe('#skills');
    expect(location.search).toBe('?source=auth&view=login');
    expect(history.state).toEqual({ routeMarker: 'preserved' });
    expect(targets.get('skills')!.scrollIntoView).not.toHaveBeenCalled();
    expect(targets.get('projects')!.scrollIntoView).toHaveBeenCalledOnce();
  });

  it('cancels initial and history restoration before an auth surface commits', () => {
    const { rerender } = renderHook(({ enabled }) => useSectionNavigation('en', enabled), {
      initialProps: { enabled: true },
    });
    rerender({ enabled: false });
    step();
    expect(targets.get('projects')!.scrollIntoView).not.toHaveBeenCalled();

    rerender({ enabled: true });
    step();
    expect(targets.get('projects')!.scrollIntoView).toHaveBeenCalledOnce();
    history.replaceState(history.state, '', '/en?source=auth&view=login#skills');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(targets.get('skills')!.scrollIntoView).not.toHaveBeenCalled();
    rerender({ enabled: false });
    step();
    expect(targets.get('skills')!.scrollIntoView).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('restores the section after a locale changes while portfolio navigation is suspended', () => {
    const { rerender } = renderHook(
      ({ enabled, locale }) => useSectionNavigation(locale, enabled),
      { initialProps: { enabled: true, locale: 'en' } },
    );
    step();
    rerender({ enabled: false, locale: 'zh-Hant' });
    history.replaceState(history.state, '', '/zh-Hant?source=auth#experience');
    rerender({ enabled: true, locale: 'zh-Hant' });
    step();
    expect(targets.get('experience')!.scrollIntoView).toHaveBeenCalledOnce();
    expect(location.search).toBe('?source=auth');
  });
});
