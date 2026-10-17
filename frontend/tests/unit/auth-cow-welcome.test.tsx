import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthCowScene } from '@/features/auth/components/AuthCowScene';
import { createI18n, supportedLocales, type Locale } from '@/i18n/config';
import type { CowWorkspaceProps } from '@/shared/ui/cow-workspace/CowWorkspace';

vi.mock('@/shared/ui/cow-workspace/CowWorkspace', () => ({
  CowWorkspace: ({
    label,
    className,
    phase,
    motion,
    parallax,
    globeRotation,
  }: CowWorkspaceProps) => (
    <div
      className={className}
      role="img"
      aria-label={label}
      data-phase={phase ?? 'cycle'}
      data-motion={String(motion)}
      data-parallax={String(parallax)}
      data-globe-rotation={String(globeRotation)}
    />
  ),
}));

afterEach(cleanup);

function renderScene(locale: Locale = 'en', active = true, welcome = false) {
  const i18n = createI18n(locale);
  const scene = (nextActive: boolean, nextWelcome: boolean) => (
    <I18nextProvider i18n={i18n}>
      <AuthCowScene active={nextActive} welcome={nextWelcome} />
    </I18nextProvider>
  );
  const view = render(scene(active, welcome));
  return {
    view,
    i18n,
    rerender: (nextActive: boolean, nextWelcome: boolean) =>
      view.rerender(scene(nextActive, nextWelcome)),
  };
}

describe('authenticated cow greeting', () => {
  it.each(supportedLocales)(
    'shows a translated passive speech bubble only when welcomed in %s',
    async (locale) => {
      const { view, i18n, rerender } = renderScene(locale);
      const cow = await view.findByRole('img', { name: i18n.t('auth.cowLabel') });
      expect(cow).toHaveAttribute('data-phase', 'cycle');
      expect(view.queryByRole('status')).toBeNull();

      rerender(true, true);
      expect(view.getByRole('img', { name: i18n.t('auth.cowLabel') })).toBe(cow);
      expect(cow).toHaveAttribute('data-phase', 'glance');
      const greeting = view.getByRole('status');
      expect(i18n.t('auth.welcome')).not.toBe('auth.welcome');
      expect(greeting).toHaveTextContent(i18n.t('auth.welcome'));
      expect(greeting).toHaveAttribute('data-auth-cow-welcome');
      expect(greeting).toHaveAttribute('aria-atomic', 'true');
      expect(greeting.querySelector('span[aria-hidden="true"]')).not.toBeNull();
      expect(greeting.querySelector('button, a, input, [tabindex]')).toBeNull();

      rerender(true, false);
      expect(view.queryByRole('status')).toBeNull();
      expect(cow).toHaveAttribute('data-phase', 'cycle');
    },
  );

  it('temporarily watches while preserving selected expression and paused scene preferences', async () => {
    const { view, i18n, rerender } = renderScene();
    const cow = await view.findByRole('img', { name: i18n.t('auth.cowLabel') });
    const modes = within(view.getByRole('group', { name: i18n.t('auth.cowModes') }));
    const thinking = modes.getByRole('button', { name: i18n.t('auth.cowThinking') });
    fireEvent.click(thinking);
    fireEvent.click(view.getByRole('button', { name: i18n.t('auth.cowPause') }));
    const mouse = view.getByRole('button', { name: i18n.t('auth.cowMouseFollow') });
    const globe = view.getByRole('button', { name: i18n.t('auth.cowGlobeRotate') });
    fireEvent.click(mouse);
    fireEvent.click(globe);

    rerender(true, true);
    expect(cow).toHaveAttribute('data-phase', 'glance');
    expect(cow).toHaveAttribute('data-motion', 'false');
    expect(cow).toHaveAttribute('data-parallax', 'false');
    expect(cow).toHaveAttribute('data-globe-rotation', 'false');
    expect(modes.getByRole('button', { name: i18n.t('auth.cowWatching') })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(mouse).toHaveAttribute('aria-pressed', 'false');
    expect(globe).toHaveAttribute('aria-pressed', 'false');
    expect(view.getByRole('button', { name: i18n.t('auth.cowPlay') })).toBeVisible();
    expect(view.getByRole('status')).toHaveTextContent(i18n.t('auth.welcome'));

    rerender(true, false);
    expect(cow).toHaveAttribute('data-phase', 'thinking');
    expect(cow).toHaveAttribute('data-motion', 'false');
    expect(cow).toHaveAttribute('data-parallax', 'false');
    expect(cow).toHaveAttribute('data-globe-rotation', 'false');
    expect(thinking).toHaveAttribute('aria-pressed', 'true');
    expect(view.queryByRole('status')).toBeNull();
  });

  it('keeps the greeting pose while page visibility gates the existing scene motion', async () => {
    const { view, i18n, rerender } = renderScene('en', false, true);
    const cow = await view.findByRole('img', { name: i18n.t('auth.cowLabel') });
    expect(cow).toHaveAttribute('data-phase', 'glance');
    expect(cow).toHaveAttribute('data-motion', 'false');
    expect(cow).toHaveAttribute('data-parallax', 'false');
    rerender(true, true);
    expect(cow).toHaveAttribute('data-phase', 'glance');
    expect(cow).toHaveAttribute('data-motion', 'true');
    expect(cow).toHaveAttribute('data-parallax', 'true');
    expect(view.getByRole('status')).toHaveTextContent(i18n.t('auth.welcome'));
  });
});
