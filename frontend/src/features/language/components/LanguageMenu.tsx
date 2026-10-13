import { useCallback, useId, useRef, useState } from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { Icon } from '@/shared/ui/Icon';
import { useDisclosureFocus } from '@/shared/hooks/useDisclosureFocus';
import { LanguageOptions } from './LanguageOptions';
import styles from './LanguageMenu.module.css';

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
        popperConfig={{ modifiers: [{ name: 'offset', options: { offset: [0, 10] } }] }}
      >
        <LanguageOptions locale={locale} busy={busy} onChange={onChange} selectedRef={selected} />
      </Dropdown.Menu>
    </Dropdown>
  );
}
