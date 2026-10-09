import { StrictMode } from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '@/i18n/config';
import { useAuthNavigation } from '@/pages/portfolio/hooks/useAuthNavigation';

const originalUrl = window.location.href;
const originalState: unknown = window.history.state;
const originalOverflow = document.body.style.overflow;
const originalPadding = document.body.style.paddingRight;

beforeEach(() => {
  window.history.replaceState(null, '', '/en');
  vi.spyOn(window.history, 'back').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.history.replaceState(originalState, '', originalUrl);
  document.body.style.overflow = originalOverflow;
  document.body.style.paddingRight = originalPadding;
});

function callbacks() {
  return { open: vi.fn(), back: vi.fn(), dismissContact: vi.fn() };
}

function visible(element: HTMLElement) {
  vi.spyOn(element, 'getClientRects').mockReturnValue([
    new DOMRect(0, 0, 40, 40),
  ] as unknown as DOMRectList);
}

describe('page-owned auth navigation', () => {
  it('adds one owned login entry while preserving Router state, query and section hash', () => {
    const state = { usr: { draft: 'saved' }, key: 'router-key', idx: 7 };
    window.history.replaceState(state, '', '/en?source=portfolio&filter=featured#projects');
    const push = vi.spyOn(window.history, 'pushState');
    const transition = callbacks();
    const view = renderHook(
      () =>
        useAuthNavigation({
          locale: 'en',
          active: false,
          visible: false,
          ...transition,
        }),
      { wrapper: StrictMode },
    );
    transition.back.mockClear();

    act(view.result.current.enter);
    act(view.result.current.enter);
    expect(push).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/en');
    expect(new URL(window.location.href).searchParams.get('view')).toBe('login');
    expect(new URL(window.location.href).searchParams.get('source')).toBe('portfolio');
    expect(new URL(window.location.href).searchParams.get('filter')).toBe('featured');
    expect(window.location.hash).toBe('#projects');
    expect(window.history.state).toEqual({ ...state, portfolioAuthEntry: expect.any(String) });
    expect(transition.dismissContact).toHaveBeenCalledTimes(2);

    act(view.result.current.leave);
    expect(window.history.back).toHaveBeenCalledOnce();
    expect(transition.back).not.toHaveBeenCalled();
    // Portfolio tracking remains suspended until the native history event arrives.
    expect(new URL(window.location.href).searchParams.get('view')).toBe('login');
    window.history.replaceState(state, '', '/en?source=portfolio&filter=featured#projects');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(transition.back).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('leaves a direct login link on its locale route without navigating away from the site', () => {
    const state = { usr: { source: 'bookmark' }, key: 'direct-key', idx: 0 };
    window.history.replaceState(
      { ...state, portfolioAuthEntry: 'another-page-owner' },
      '',
      '/zh-Hant?source=bookmark&view=login#journey',
    );
    const transition = callbacks();
    const view = renderHook(() =>
      useAuthNavigation({ locale: 'zh-Hant', active: true, visible: false, ...transition }),
    );
    expect(transition.open).toHaveBeenCalledOnce();
    expect(transition.dismissContact).toHaveBeenCalledOnce();
    expect(transition.back).not.toHaveBeenCalled();

    act(view.result.current.leave);
    expect(window.history.back).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/zh-Hant');
    expect(window.location.search).toBe('?source=bookmark');
    expect(window.location.hash).toBe('#journey');
    expect(window.history.state).toEqual(state);
    expect(transition.back).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('treats a login entry from an unmounted owner as a direct link', () => {
    const state = { key: 'preserved-key', idx: 3 };
    window.history.replaceState(state, '', '/en?source=reload#skills');
    const transition = callbacks();
    const first = renderHook(() =>
      useAuthNavigation({ locale: 'en', active: false, visible: false, ...transition }),
    );
    act(first.result.current.enter);
    first.unmount();

    const next = renderHook(() =>
      useAuthNavigation({ locale: 'en', active: true, visible: false, ...transition }),
    );
    act(next.result.current.leave);
    expect(window.history.back).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?source=reload');
    expect(window.location.hash).toBe('#skills');
    expect(window.history.state).toEqual(state);
    next.unmount();
  });

  it('synchronizes browser back and forward without changing the current route state', () => {
    const transition = callbacks();
    const state = { usr: { tab: 'projects' }, key: 'pop-key', idx: 4 };
    const view = renderHook(
      ({ locale }: { locale: Locale }) =>
        useAuthNavigation({ locale, active: false, visible: false, ...transition }),
      { initialProps: { locale: 'en' } },
    );
    expect(transition.back).toHaveBeenCalledOnce();
    transition.back.mockClear();

    window.history.replaceState(state, '', '/en?source=history&view=login#projects');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(transition.open).toHaveBeenCalledOnce();
    expect(transition.dismissContact).toHaveBeenCalledOnce();
    expect(window.history.state).toEqual(state);

    window.history.replaceState(state, '', '/zh-Hant?source=history#projects');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(transition.back).toHaveBeenCalledOnce();
    view.rerender({ locale: 'zh-Hant' });
    expect(window.history.state).toEqual(state);
    expect(window.location.search).toBe('?source=history');
    expect(window.location.hash).toBe('#projects');

    view.unmount();
    transition.open.mockClear();
    transition.back.mockClear();
    window.history.replaceState(state, '', '/zh-Hant?view=login#projects');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(transition.open).not.toHaveBeenCalled();
    expect(transition.back).not.toHaveBeenCalled();
  });

  it('locks scrolling only for visible auth and restores the previous body styles', () => {
    document.body.style.overflow = 'auto';
    document.body.style.paddingRight = '12px';
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(
      window.innerWidth - 24,
    );
    const transition = callbacks();
    const view = renderHook(
      ({ shown }) =>
        useAuthNavigation({ locale: 'en', active: true, visible: shown, ...transition }),
      { initialProps: { shown: false } },
    );
    expect(document.body.style.overflow).toBe('auto');
    view.rerender({ shown: true });
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.paddingRight).toBe('36px');
    view.rerender({ shown: false });
    expect(document.body.style.overflow).toBe('auto');
    expect(document.body.style.paddingRight).toBe('12px');
    view.rerender({ shown: true });
    view.unmount();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.body.style.paddingRight).toBe('12px');
  });

  it('waits for a mobile drawer to release its lock and cancels that wait when auth closes', () => {
    vi.useFakeTimers();
    render(<div id="mobile-navigation" />);
    document.body.style.overflow = 'auto';
    const transition = callbacks();
    const view = renderHook(
      ({ shown }) =>
        useAuthNavigation({ locale: 'en', active: true, visible: shown, ...transition }),
      { initialProps: { shown: true } },
    );
    act(() => vi.advanceTimersByTime(399));
    expect(document.body.style.overflow).toBe('auto');
    view.rerender({ shown: false });
    act(() => vi.advanceTimersByTime(1000));
    expect(document.body.style.overflow).toBe('auto');
    view.rerender({ shown: true });
    act(() => vi.advanceTimersByTime(400));
    expect(document.body.style.overflow).toBe('hidden');
    view.unmount();
    expect(document.body.style.overflow).toBe('auto');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives expanded menus and consumed Escape priority, then releases its listener on unmount', () => {
    const menu = render(
      <section data-auth-panel>
        <button aria-expanded="true">Appearance</button>
      </section>,
    );
    const transition = callbacks();
    const view = renderHook(() =>
      useAuthNavigation({ locale: 'en', active: true, visible: false, ...transition }),
    );
    act(view.result.current.enter);
    transition.back.mockClear();
    const menuEscape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    act(() => document.dispatchEvent(menuEscape));
    expect(menuEscape.defaultPrevented).toBe(false);
    expect(transition.back).not.toHaveBeenCalled();
    expect(window.history.back).not.toHaveBeenCalled();

    menu.rerender(
      <section data-auth-panel>
        <button aria-expanded="false">Appearance</button>
      </section>,
    );
    const consumedEscape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    consumedEscape.preventDefault();
    act(() => document.dispatchEvent(consumedEscape));
    expect(transition.back).not.toHaveBeenCalled();
    const pageEscape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    act(() => document.dispatchEvent(pageEscape));
    expect(pageEscape.defaultPrevented).toBe(true);
    expect(window.history.back).toHaveBeenCalledOnce();
    expect(transition.back).not.toHaveBeenCalled();
    window.history.replaceState(null, '', '/en');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(transition.back).toHaveBeenCalledOnce();
    view.unmount();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(window.history.back).toHaveBeenCalledOnce();
  });

  it('returns focus to the original visible trigger without scrolling', () => {
    vi.useFakeTimers();
    const targets = render(
      <>
        <button data-login-trigger>Sign in</button>
        <section data-auth-panel>
          <input aria-label="Email" />
        </section>
      </>,
    );
    const trigger = targets.getByRole('button', { name: 'Sign in' });
    visible(trigger);
    const focus = vi.spyOn(trigger, 'focus');
    const transition = callbacks();
    const view = renderHook(
      ({ active }) => useAuthNavigation({ locale: 'en', active, visible: false, ...transition }),
      { initialProps: { active: false } },
    );
    trigger.focus();
    act(view.result.current.enter);
    view.rerender({ active: true });
    targets.getByRole('textbox').focus();
    view.rerender({ active: false });
    act(() => vi.advanceTimersByTime(20));
    expect(trigger).toHaveFocus();
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    view.rerender({ active: true });
    targets.getByRole('textbox').focus();
    focus.mockClear();
    view.rerender({ active: false });
    view.unmount();
    act(() => vi.advanceTimersByTime(20));
    expect(focus).not.toHaveBeenCalled();
  });

  it('falls back to the visible mobile menu when a drawer login trigger disappears', () => {
    vi.useFakeTimers();
    const targets = render(
      <>
        <button key="drawer" data-login-trigger>
          Drawer sign in
        </button>
        <button key="mobile" aria-controls="mobile-navigation">
          Menu
        </button>
      </>,
    );
    const trigger = targets.getByRole('button', { name: 'Drawer sign in' });
    const menu = targets.getByRole('button', { name: 'Menu' });
    visible(trigger);
    visible(menu);
    const transition = callbacks();
    const view = renderHook(
      ({ active }) => useAuthNavigation({ locale: 'en', active, visible: false, ...transition }),
      { initialProps: { active: false } },
    );
    trigger.focus();
    act(view.result.current.enter);
    view.rerender({ active: true });
    targets.rerender(
      <button key="mobile" aria-controls="mobile-navigation">
        Menu
      </button>,
    );
    const remainingMenu = targets.getByRole('button', { name: 'Menu' });
    visible(remainingMenu);
    view.rerender({ active: false });
    act(() => vi.advanceTimersByTime(20));
    expect(remainingMenu).toHaveFocus();
    view.unmount();
  });
});
