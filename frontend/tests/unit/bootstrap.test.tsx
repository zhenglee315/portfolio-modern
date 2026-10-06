import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/AppProviders';
import { createI18n } from '@/i18n/config';
import { useTranslation } from 'react-i18next';

/** Render only the localized provider boundary, independently of API features. */
function Heading() {
  const { t } = useTranslation();
  return <h1>{t('profile.title')}</h1>;
}

describe('application localization boundaries', () => {
  it('keeps independently initialized render contexts in their own language', () => {
    const english = createI18n('en');
    const traditionalChinese = createI18n('zh-Hant');

    expect(english.t('profile.title')).toBe('Personal profile');
    expect(traditionalChinese.t('profile.title')).toBe('個人檔案');
  });

  it('updates visible translations when the route locale changes', () => {
    const view = render(
      <AppProviders locale="en">
        <Heading />
      </AppProviders>,
    );
    expect(within(view.container).getByRole('heading', { name: 'Personal profile' })).toBeVisible();

    view.rerender(
      <AppProviders locale="zh-Hant">
        <Heading />
      </AppProviders>,
    );
    expect(within(view.container).getByRole('heading', { name: '個人檔案' })).toBeVisible();
    expect(within(view.container).queryByRole('heading', { name: 'Personal profile' })).toBeNull();
  });
});
