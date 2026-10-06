import { useCallback, useId, useRef, useState, type KeyboardEvent } from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import { useTranslation } from 'react-i18next';
import { supportedLocales, type Locale } from '@/i18n/config';
import { Icon } from '@/shared/ui/Icon';
import { useDisclosureFocus } from '@/shared/hooks/useDisclosureFocus';
import styles from './LanguageMenu.module.css';

const labels: Record<Locale, string> = {
  en: 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
};
const badges: Record<Locale, string> = { en: 'EN', 'zh-Hans': '简', 'zh-Hant': '繁' };

/** Present the original checked locale disclosure and compact current-language badge.
 * @param props Current locale, preparation status, page-owned change and optional opening callbacks.
 * @returns A circular trigger and three language choices; preparation remains page-owned.
 * Choices remain available during preparation so a later selection can cancel the old one.
 * Opening focuses the current locale; focus listeners are released on close or unmount.
 */
export function LanguageMenu({
  locale,
  busy,
  onChange,
  onOpen,
}: {
  locale: Locale;
  busy: boolean;
  onChange: (locale: Locale) => void;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    selected = useRef<HTMLButtonElement>(null);
  // Locale preparation updates preserve focus while sharing one disclosure lifecycle.
  const closeOnBlur = useCallback(() => setOpen(false), []);
  useDisclosureFocus(open, root, selected, closeOnBlur);
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
    <Dropdown
      ref={root}
      className={styles.dropdown}
      show={open}
      focusFirstItemOnShow={false}
      onToggle={(value, metadata) => {
        if (value) onOpen?.();
        setOpen(value);
        if (!value && (metadata.source === 'keydown' || metadata.source === 'select'))
          trigger.current?.focus();
      }}
    >
      <Dropdown.Toggle
        ref={trigger}
        id={id}
        className={`icon-button ${styles.trigger}`}
        variant="link"
        aria-label={t('ui.language')}
        aria-controls={`${id}-panel`}
        aria-busy={busy}
      >
        <Icon name="translate" />
        <span className={styles.badge} aria-hidden="true">
          {badges[locale]}
        </span>
      </Dropdown.Toggle>
      <Dropdown.Menu
        id={`${id}-panel`}
        className={styles.menu}
        aria-label={t('ui.languageMenu')}
        align="end"
        onKeyDownCapture={moveMenuFocus}
        popperConfig={{ modifiers: [{ name: 'offset', options: { offset: [0, 10] } }] }}
      >
        {supportedLocales.map((value) => (
          <Dropdown.Item
            as="button"
            type="button"
            key={value}
            ref={locale === value ? selected : undefined}
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
      </Dropdown.Menu>
    </Dropdown>
  );
}
