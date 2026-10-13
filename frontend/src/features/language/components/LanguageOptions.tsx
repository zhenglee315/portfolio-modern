import { type KeyboardEvent, type RefObject } from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import { useTranslation } from 'react-i18next';
import { supportedLocales, type Locale } from '@/i18n/config';
import { Icon } from '@/shared/ui/Icon';
import styles from './LanguageOptions.module.css';

const labels: Record<Locale, string> = {
  en: 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
};

/** Share checked locale choices and cyclic keyboard navigation across settings disclosures. */
export function LanguageOptions({
  locale,
  busy,
  onChange,
  selectedRef,
}: {
  locale: Locale;
  busy: boolean;
  onChange: (locale: Locale) => void;
  selectedRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation();
  /** Preserve the original cyclic language focus order without changing the selected locale.
   * @param event Menu-owned focus-navigation key; already-prevented and unrelated keys are untouched.
   * @returns Nothing. Capture runs before Bootstrap's document-level clamped arrow handler.
   * Escape, Tab, selection and dismissal remain owned by the existing dropdown lifecycle.
   */
  const moveMenuFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
      return;
    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-locale]:not(:disabled)'),
    );
    const index = options.findIndex(
      (option) => option === event.currentTarget.ownerDocument.activeElement,
    );
    if (index < 0 || !options.length) return;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    event.preventDefault();
    event.stopPropagation();
    options[next]?.focus();
  };
  return (
    <div
      className={styles.options}
      role="group"
      aria-label={t('ui.languageMenu')}
      aria-busy={busy}
      onKeyDownCapture={moveMenuFocus}
    >
      {supportedLocales.map((value) => (
        <Dropdown.Item
          as="button"
          type="button"
          key={value}
          ref={locale === value ? selectedRef : undefined}
          lang={value}
          data-locale={value}
          active={locale === value}
          aria-current={locale === value ? 'true' : undefined}
          onClick={() => onChange(value)}
        >
          {labels[value]}
          <Icon name="check" className={styles.check} />
        </Dropdown.Item>
      ))}
    </div>
  );
}
