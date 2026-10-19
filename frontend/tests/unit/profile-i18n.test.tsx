import { useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Locale } from '@/i18n/locales';
import { profileMessages } from '@/i18n/profile-copy';
import { useProfileI18n } from '@/i18n/useProfileI18n';

function WorkingCopy() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  return (
    <>
      <h2>{t('profileEditor.skillsPreviewTitle')}</h2>
      <input
        aria-label="Unsaved draft"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
      />
    </>
  );
}

function Editor({ locale, resources }: { locale: Locale; resources: typeof profileMessages }) {
  const i18n = useProfileI18n(locale, resources);
  return (
    <I18nextProvider i18n={i18n}>
      <WorkingCopy />
    </I18nextProvider>
  );
}

describe('Profile dictionary updates', () => {
  it('replaces an exposed key when copy arrives without remounting unsaved work', () => {
    const stale = structuredClone(profileMessages);
    for (const messages of Object.values(stale))
      Reflect.deleteProperty(messages, 'skillsPreviewTitle');
    const { rerender } = render(<Editor locale="zh-Hant" resources={stale} />);
    expect(screen.getByRole('heading')).toHaveTextContent('profileEditor.skillsPreviewTitle');
    fireEvent.change(screen.getByLabelText('Unsaved draft'), {
      target: { value: 'Keep this edit' },
    });
    const updated = structuredClone(profileMessages);
    rerender(<Editor locale="zh-Hant" resources={updated} />);
    expect(screen.getByRole('heading')).toHaveTextContent('公開頁預覽');
    expect(screen.getByLabelText('Unsaved draft')).toHaveValue('Keep this edit');
    updated['zh-Hant'].skillsPreviewTitle = '更新後的預覽標題';
    rerender(<Editor locale="zh-Hant" resources={structuredClone(updated)} />);
    expect(screen.getByRole('heading')).toHaveTextContent('更新後的預覽標題');
    rerender(<Editor locale="en" resources={updated} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Public page preview');
    expect(screen.getByLabelText('Unsaved draft')).toHaveValue('Keep this edit');
  });
});
