import { cleanup, fireEvent, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import playIcon from 'bootstrap-icons/icons/play-fill.svg?raw';
import pauseIcon from 'bootstrap-icons/icons/pause-fill.svg?raw';
import { AuthCowScene } from '@/features/auth/components/AuthCowScene';
import { AuthPanel } from '@/features/auth';
import { createI18n, supportedLocales } from '@/i18n/config';
import type { CowWorkspaceProps } from '@/shared/ui/cow-workspace/CowWorkspace';

const workspaceFailure = vi.hoisted(() => ({ failed: false }));
const workspaceProps = vi.hoisted(() => ({ current: null as CowWorkspaceProps | null }));
const controlCopy = [
  ['cowCycle', 'cycle'],
  ['cowThinking', 'thinking'],
  ['cowCoding', 'coding'],
  ['cowWatching', 'hello'],
  ['cowGlobeRotate', 'globeStop'],
  ['cowMouseFollow', 'mouseStop'],
  ['cowPause', 'pause'],
] as const;

vi.mock('@/shared/ui/cow-workspace/CowWorkspace', () => ({
  CowWorkspace: (props: CowWorkspaceProps) => {
    workspaceProps.current = props;
    const { label, phase, motion, parallax, globeRotation } = props;
    if (workspaceFailure.failed) throw new Error('The illustration failed to load.');
    return (
      <div
        role="img"
        aria-label={label}
        data-phase={phase ?? 'cycle'}
        data-motion={String(motion)}
        data-parallax={String(parallax)}
        data-globe-rotation={String(globeRotation)}
      />
    );
  },
}));

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  workspaceFailure.failed = false;
  workspaceProps.current = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderScene(active = true) {
  const i18n = createI18n('en');
  const view = render(
    <I18nextProvider i18n={i18n}>
      <AuthCowScene active={active} />
    </I18nextProvider>,
  );
  return {
    view,
    i18n,
    rerender: (nextActive: boolean) =>
      view.rerender(
        <I18nextProvider i18n={i18n}>
          <AuthCowScene active={nextActive} />
        </I18nextProvider>,
      ),
  };
}

function expectPlaybackIcon(button: HTMLElement, icon: string) {
  const markup = document.createElement('div');
  markup.innerHTML = icon;
  expect(button.querySelector('svg')?.outerHTML).toBe(markup.querySelector('svg')?.outerHTML);
}

describe('login cow scene controls', () => {
  it('tracks the live input fields and preserves a user pause across keyed account form replacements', async () => {
    const i18n = createI18n('en');
    const view = render(
      <I18nextProvider i18n={i18n}>
        <AuthPanel onBack={vi.fn()} />
      </I18nextProvider>,
    );
    const scene = await view.findByRole('img');
    const origin = workspaceProps.current?.pointerOrigin;
    expect(workspaceProps.current?.pointerScope).toBe('page');
    expect(origin).toBeDefined();
    const globe = view.getByRole('button', { name: i18n.t('auth.cowGlobeRotate') });
    fireEvent.click(globe);
    const playback = view.getByRole('button', { name: i18n.t('auth.cowPause') });
    fireEvent.click(playback);

    const expectLiveFields = (count: number) => {
      const email = view.getByLabelText(i18n.t('auth.email'));
      const fields = origin?.current;
      expect(workspaceProps.current?.pointerOrigin).toBe(origin);
      expect(workspaceProps.current?.pointerScope).toBe('page');
      expect(fields).toContainElement(email);
      expect(fields?.querySelectorAll('input')).toHaveLength(count);
      expect(fields?.closest('form')).toBe(email.closest('form'));
      expect(fields?.closest('[data-auth-size]')).toBeNull();
      expect(view.getByRole('img')).toBe(scene);
      expect(view.getByRole('button', { name: i18n.t('auth.cowGlobeRotate') })).toBe(globe);
      expect(globe).toHaveAttribute('aria-pressed', 'false');
      expect(scene).toHaveAttribute('data-globe-rotation', 'false');
      expect(view.getByRole('button', { name: i18n.t('auth.cowPlay') })).toBe(playback);
      expect(scene).toHaveAttribute('data-motion', 'false');
      expectPlaybackIcon(playback, playIcon);
      return fields;
    };

    const loginFields = expectLiveFields(2);
    const modeControls = within(view.getByRole('group', { name: i18n.t('auth.modeLabel') }));
    fireEvent.click(modeControls.getByRole('button', { name: i18n.t('auth.register') }));
    const registerFields = expectLiveFields(4);
    expect(registerFields).toContainElement(view.getByLabelText(i18n.t('auth.confirmPassword')));
    expect(registerFields).not.toBe(loginFields);
    expect(loginFields?.isConnected).toBe(false);

    fireEvent.click(modeControls.getByRole('button', { name: i18n.t('auth.login') }));
    expectLiveFields(2);
    expect(registerFields?.isConnected).toBe(false);
    fireEvent.click(view.getByRole('button', { name: i18n.t('auth.forgotPassword') }));
    expectLiveFields(1);
  });

  it('starts in the natural cycle and selects mutually exclusive poses without replacing the scene', async () => {
    const { view, i18n } = renderScene();
    const scene = await view.findByRole('img', { name: i18n.t('auth.cowLabel') });
    const modes = within(view.getByRole('group', { name: i18n.t('auth.cowModes') }));
    expect(scene).toHaveAttribute('data-phase', 'cycle');
    expect(scene).toHaveAttribute('data-motion', 'true');
    expect(modes.getAllByRole('button')).toHaveLength(4);

    for (const [key, phase] of [
      ['cowThinking', 'thinking'],
      ['cowCoding', 'typing'],
      ['cowWatching', 'glance'],
      ['cowCycle', 'cycle'],
    ]) {
      const button = modes.getByRole('button', { name: i18n.t(`auth.${key}`) });
      fireEvent.click(button);
      expect(modes.getAllByRole('button', { pressed: true })).toEqual([button]);
      expect(view.getByRole('img')).toBe(scene);
      expect(scene).toHaveAttribute('data-phase', phase);
    }
  });

  it('gates motion until page reveal and keeps a user pause across page suspension and mode selection', async () => {
    const { view, i18n, rerender } = renderScene(false);
    const scene = await view.findByRole('img');
    const playback = view.getByRole('button', { name: i18n.t('auth.cowPause') });
    expect(view.queryByRole('button', { name: i18n.t('auth.cowPlay') })).toBeNull();
    expect(playback).not.toHaveAttribute('aria-pressed');
    expectPlaybackIcon(playback, pauseIcon);
    expect(scene).toHaveAttribute('data-motion', 'false');
    expect(scene).toHaveAttribute('data-parallax', 'false');
    rerender(true);
    expect(scene).toHaveAttribute('data-motion', 'true');
    expect(scene).toHaveAttribute('data-parallax', 'true');

    const user = userEvent.setup();
    playback.focus();
    await user.keyboard(' ');
    expect(playback).toHaveFocus();
    expect(view.getByRole('button', { name: i18n.t('auth.cowPlay') })).toBe(playback);
    expect(view.queryByRole('button', { name: i18n.t('auth.cowPause') })).toBeNull();
    expectPlaybackIcon(playback, playIcon);
    fireEvent.click(view.getByRole('button', { name: i18n.t('auth.cowCoding') }));
    expect(scene).toHaveAttribute('data-phase', 'typing');
    expect(scene).toHaveAttribute('data-motion', 'false');
    rerender(false);
    rerender(true);
    expect(view.getByRole('img')).toBe(scene);
    expect(scene).toHaveAttribute('data-motion', 'false');
    expect(view.getByRole('button', { name: i18n.t('auth.cowPlay') })).toBe(playback);
    await user.keyboard('{Enter}');
    expect(scene).toHaveAttribute('data-phase', 'typing');
    expect(scene).toHaveAttribute('data-motion', 'true');
    expect(scene).toHaveAttribute('data-parallax', 'true');
    expect(view.getByRole('button', { name: i18n.t('auth.cowPause') })).toBe(playback);
    expect(playback).toHaveFocus();
    expect(playback).not.toHaveAttribute('aria-pressed');
    expectPlaybackIcon(playback, pauseIcon);
  });

  it('toggles mouse following independently and preserves the preference across playback, pose and page changes', async () => {
    const { view, i18n, rerender } = renderScene();
    const scene = await view.findByRole('img');
    const mouse = view.getByRole('button', { name: i18n.t('auth.cowMouseFollow') });
    const playback = view.getByRole('button', { name: i18n.t('auth.cowPause') });
    expect(mouse).toHaveAttribute('aria-pressed', 'true');
    expect(mouse).not.toHaveAttribute('title');

    fireEvent.click(mouse);
    expect(mouse).toHaveAttribute('aria-pressed', 'false');
    expect(scene).toHaveAttribute('data-phase', 'cycle');
    expect(scene).toHaveAttribute('data-motion', 'true');
    expect(scene).toHaveAttribute('data-parallax', 'false');
    expect(playback).toHaveAccessibleName(i18n.t('auth.cowPause'));

    fireEvent.click(playback);
    fireEvent.click(playback);
    expect(scene).toHaveAttribute('data-motion', 'true');
    expect(scene).toHaveAttribute('data-parallax', 'false');
    fireEvent.click(view.getByRole('button', { name: i18n.t('auth.cowCoding') }));
    expect(scene).toHaveAttribute('data-phase', 'typing');
    expect(scene).toHaveAttribute('data-parallax', 'false');
    rerender(false);
    expect(scene).toHaveAttribute('data-motion', 'false');
    rerender(true);
    expect(view.getByRole('img')).toBe(scene);
    expect(scene).toHaveAttribute('data-motion', 'true');
    expect(scene).toHaveAttribute('data-parallax', 'false');
    expect(mouse).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(playback);
    fireEvent.click(mouse);
    expect(mouse).toHaveAttribute('aria-pressed', 'true');
    expect(scene).toHaveAttribute('data-motion', 'false');
    expect(scene).toHaveAttribute('data-parallax', 'false');
    fireEvent.click(playback);
    expect(scene).toHaveAttribute('data-phase', 'typing');
    expect(scene).toHaveAttribute('data-motion', 'true');
    expect(scene).toHaveAttribute('data-parallax', 'true');
  });

  it('toggles globe rotation independently and preserves the preference across playback, pose and page changes', async () => {
    const { view, i18n, rerender } = renderScene();
    const scene = await view.findByRole('img');
    const globe = view.getByRole('button', { name: i18n.t('auth.cowGlobeRotate') });
    const mouse = view.getByRole('button', { name: i18n.t('auth.cowMouseFollow') });
    const playback = view.getByRole('button', { name: i18n.t('auth.cowPause') });
    const controls = within(view.getByRole('group', { name: i18n.t('auth.cowPlayback') }));
    expect(controls.getAllByRole('button')).toEqual([globe, mouse, playback]);
    expect(globe).toHaveAttribute('aria-pressed', 'true');
    expect(scene).toHaveAttribute('data-globe-rotation', 'true');

    fireEvent.click(globe);
    expect(globe).toHaveAttribute('aria-pressed', 'false');
    expect(scene).toHaveAttribute('data-globe-rotation', 'false');
    expect(scene).toHaveAttribute('data-motion', 'true');
    expect(scene).toHaveAttribute('data-parallax', 'true');
    expect(scene).toHaveAttribute('data-phase', 'cycle');

    fireEvent.click(mouse);
    fireEvent.click(playback);
    fireEvent.click(view.getByRole('button', { name: i18n.t('auth.cowCoding') }));
    rerender(false);
    rerender(true);
    fireEvent.click(playback);
    expect(view.getByRole('img')).toBe(scene);
    expect(globe).toHaveAttribute('aria-pressed', 'false');
    expect(scene).toHaveAttribute('data-globe-rotation', 'false');
    expect(scene).toHaveAttribute('data-motion', 'true');
    expect(scene).toHaveAttribute('data-parallax', 'false');
    expect(scene).toHaveAttribute('data-phase', 'typing');

    fireEvent.click(playback);
    fireEvent.click(globe);
    expect(globe).toHaveAttribute('aria-pressed', 'true');
    expect(scene).toHaveAttribute('data-globe-rotation', 'true');
    expect(scene).toHaveAttribute('data-motion', 'false');
    expect(mouse).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(playback);
    expect(scene).toHaveAttribute('data-motion', 'true');
    expect(scene).toHaveAttribute('data-parallax', 'false');
    expect(scene).toHaveAttribute('data-phase', 'typing');
    expect(scene).toHaveAttribute('data-globe-rotation', 'true');
  });

  it('shares one pixel tooltip contract across all seven controls and dismisses it before each action', async () => {
    const { view, i18n } = renderScene();
    const scene = await view.findByRole('img');
    expect(view.getAllByRole('button')).toHaveLength(7);
    fireEvent.click(view.getByRole('button', { name: i18n.t('auth.cowThinking') }));

    for (const [label, tip] of controlCopy) {
      const button = view.getByRole('button', { name: i18n.t(`auth.${label}`) });
      expect(button).not.toHaveAttribute('title');
      fireEvent.pointerEnter(button, { pointerType: 'mouse' });
      const tooltip = view.getByRole('tooltip');
      expect(tooltip).toHaveTextContent(i18n.t(`auth.cowTips.${tip}`));
      expect(tooltip.parentElement).toBe(document.body);
      expect(button).toHaveAttribute('aria-describedby', tooltip.id);

      fireEvent.click(button);
      expect(view.queryByRole('tooltip')).toBeNull();
      expect(button).not.toHaveAttribute('aria-describedby');
      expect(view.getByRole('img')).toBe(scene);
      if (label === 'cowPause') expect(button).not.toHaveAttribute('aria-pressed');
      else {
        expect(button).toHaveAttribute(
          'aria-pressed',
          label === 'cowMouseFollow' || label === 'cowGlobeRotate' ? 'false' : 'true',
        );
      }
      if (label === 'cowCycle') expect(scene).toHaveAttribute('data-phase', 'cycle');
      if (label === 'cowThinking') expect(scene).toHaveAttribute('data-phase', 'thinking');
      if (label === 'cowCoding') expect(scene).toHaveAttribute('data-phase', 'typing');
      if (label === 'cowWatching') expect(scene).toHaveAttribute('data-phase', 'glance');
      if (label === 'cowGlobeRotate') {
        expect(scene).toHaveAttribute('data-motion', 'true');
        expect(scene).toHaveAttribute('data-parallax', 'true');
        expect(scene).toHaveAttribute('data-globe-rotation', 'false');
      }
      if (label === 'cowMouseFollow') {
        expect(scene).toHaveAttribute('data-motion', 'true');
        expect(scene).toHaveAttribute('data-parallax', 'false');
      }
      if (label === 'cowPause') expect(scene).toHaveAttribute('data-motion', 'false');
    }
    const playback = view.getByRole('button', { name: i18n.t('auth.cowPlay') });
    fireEvent.pointerEnter(playback, { pointerType: 'mouse' });
    expect(view.getByRole('tooltip')).toHaveTextContent(i18n.t('auth.cowTips.play'));
    fireEvent.click(playback);
    expect(view.queryByRole('tooltip')).toBeNull();
    expect(playback).not.toHaveAttribute('aria-describedby');
    expect(view.getByRole('button', { name: i18n.t('auth.cowPause') })).toBe(playback);
    expect(scene).toHaveAttribute('data-motion', 'true');
  });

  it('discloses the same short tooltip on keyboard focus and consumes Escape without changing the pose', async () => {
    const { view, i18n } = renderScene();
    const scene = await view.findByRole('img');
    const button = view.getByRole('button', { name: i18n.t('auth.cowThinking') });
    // jsdom does not reproduce keyboard focus-visible modality after pointer interactions.
    const matches = button.matches.bind(button);
    vi.spyOn(button, 'matches').mockImplementation((selector) =>
      selector === ':focus-visible' ? document.activeElement === button : matches(selector),
    );
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    expect(button).toHaveFocus();
    const tooltip = view.getByRole('tooltip');
    expect(tooltip).toHaveTextContent(i18n.t('auth.cowTips.thinking'));
    expect(button).toHaveAttribute('aria-describedby', tooltip.id);
    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(button, escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(view.queryByRole('tooltip')).toBeNull();
    expect(button).not.toHaveAttribute('aria-describedby');
    expect(button).toHaveFocus();
    expect(scene).toHaveAttribute('data-phase', 'cycle');
  });

  it('contains illustration failures while preserving the account form and scene controls', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const i18n = createI18n('en');
    const onBack = vi.fn();
    const view = render(
      <I18nextProvider i18n={i18n}>
        <AuthPanel onBack={onBack} />
      </I18nextProvider>,
    );
    await view.findByRole('img');
    const email = view.getByLabelText(i18n.t('auth.email'));
    fireEvent.change(email, { target: { value: 'person@example.com' } });

    workspaceFailure.failed = true;
    fireEvent.click(view.getByRole('button', { name: i18n.t('auth.cowThinking') }));
    expect(view.queryByRole('img')).toBeNull();
    expect(email).toHaveValue('person@example.com');
    expect(view.getByRole('heading', { name: i18n.t('auth.loginTitle') })).toBeVisible();
    expect(view.getByRole('group', { name: i18n.t('auth.cowModes') })).toBeVisible();
    const playback = view.getByRole('button', { name: i18n.t('auth.cowPause') });
    fireEvent.click(playback);
    expect(view.getByRole('button', { name: i18n.t('auth.cowPlay') })).toBe(playback);
    expectPlaybackIcon(playback, playIcon);
    fireEvent.click(view.getByRole('button', { name: i18n.t('auth.backToPortfolio') }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it.each(supportedLocales)('provides localized scene and control names in %s', async (locale) => {
    const i18n = createI18n(locale);
    const view = render(
      <I18nextProvider i18n={i18n}>
        <AuthCowScene />
      </I18nextProvider>,
    );
    expect(await view.findByRole('img', { name: i18n.t('auth.cowLabel') })).toBeVisible();
    for (const [key, tip] of controlCopy) {
      const label = i18n.t(`auth.${key}`);
      expect(label).not.toContain('auth.');
      const button = view.getByRole('button', { name: label });
      expect(button).toBeVisible();
      expect(button).not.toHaveAttribute('title');
      const text = i18n.t(`auth.cowTips.${tip}`);
      expect(text).not.toContain('auth.');
      fireEvent.pointerEnter(button, { pointerType: 'mouse' });
      expect(view.getByRole('tooltip')).toHaveTextContent(text);
      fireEvent.keyDown(button, { key: 'Escape' });
      expect(view.queryByRole('tooltip')).toBeNull();
    }
    const playback = view.getByRole('button', { name: i18n.t('auth.cowPause') });
    fireEvent.click(playback);
    expect(view.getByRole('button', { name: i18n.t('auth.cowPlay') })).toBe(playback);
    expect(i18n.t('auth.cowPlay')).not.toContain('auth.');
    fireEvent.pointerEnter(playback, { pointerType: 'mouse' });
    expect(view.getByRole('tooltip')).toHaveTextContent(i18n.t('auth.cowTips.play'));
    expect(i18n.t('auth.cowTips.play')).not.toContain('auth.');
    fireEvent.click(playback);
    expect(view.queryByRole('tooltip')).toBeNull();
    expect(playback).not.toHaveAttribute('aria-describedby');
    expect(view.getByRole('button', { name: i18n.t('auth.cowPause') })).toBe(playback);
    fireEvent.pointerEnter(playback, { pointerType: 'mouse' });
    expect(view.getByRole('tooltip')).toHaveTextContent(i18n.t('auth.cowTips.pause'));
    fireEvent.keyDown(playback, { key: 'Escape' });
    const mouse = view.getByRole('button', { name: i18n.t('auth.cowMouseFollow') });
    fireEvent.click(mouse);
    fireEvent.pointerEnter(mouse, { pointerType: 'mouse' });
    expect(view.getByRole('tooltip')).toHaveTextContent(i18n.t('auth.cowTips.mouseStart'));
    expect(mouse).toHaveAttribute('aria-describedby', view.getByRole('tooltip').id);
    expect(view.getByRole('button', { name: i18n.t('auth.cowMouseFollow') })).toBe(mouse);
    expect(i18n.t('auth.cowTips.mouseStart')).not.toContain('auth.');
    fireEvent.keyDown(mouse, { key: 'Escape' });
    const globe = view.getByRole('button', { name: i18n.t('auth.cowGlobeRotate') });
    fireEvent.click(globe);
    fireEvent.pointerEnter(globe, { pointerType: 'mouse' });
    expect(view.getByRole('tooltip')).toHaveTextContent(i18n.t('auth.cowTips.globeStart'));
    expect(globe).toHaveAttribute('aria-describedby', view.getByRole('tooltip').id);
    expect(view.getByRole('button', { name: i18n.t('auth.cowGlobeRotate') })).toBe(globe);
    expect(i18n.t('auth.cowTips.globeStart')).not.toContain('auth.');
    const poseWords =
      locale === 'en'
        ? ['Thinking', 'Coding', 'Hello']
        : locale === 'zh-Hans'
          ? ['思考', '编程', '你好']
          : ['思考', '編程', '你好'];
    expect(['thinking', 'coding', 'hello'].map((key) => i18n.t(`auth.cowTips.${key}`))).toEqual(
      poseWords,
    );
  });
});
