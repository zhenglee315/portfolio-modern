import { useCallback, useId, useRef, useState } from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import { preferenceMenuPosition } from '@/shared/lib/menu-position';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { Icon } from '@/shared/ui/Icon';
import { useDisclosureFocus } from '@/shared/hooks/useDisclosureFocus';
import { LanguageOptions } from './LanguageOptions';
import { languageNames } from '../model/languages';
import styles from './LanguageMenu.module.css';

const badges: Record<Locale, string> = { en: 'EN', 'zh-Hans': '简', 'zh-Hant': '繁' };

/** Present one checked locale disclosure with a compact badge or full language-name trigger.
 * @param props Current locale, preparation status, page-owned change and optional opening callbacks.
 * @returns A trigger and three language choices; preparation and persistence remain page-owned.
 * Choices remain available during preparation so a later selection can cancel the old one.
 * Opening focuses the current locale; focus listeners are released on close or unmount.
 */
export function LanguageMenu({
  locale,
  busy,
  onChange,
  onOpen,
  variant = 'icon',
  label,
  disabled = false,
}: {
  locale: Locale;
  busy: boolean;
  onChange: (locale: Locale) => void;
  onOpen?: () => void;
  /** Text controls reuse the same menu and focus lifecycle when a full current-language name is needed. */
  variant?: 'icon' | 'text';
  label?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  // Saving disables content editing; ordinary async locale preparation still permits a newer choice.
  if (open && disabled) setOpen(false);
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
      show={open && !disabled}
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
        className={variant === 'text' ? styles.textTrigger : `icon-button ${styles.trigger}`}
        variant="link"
        aria-label={label ?? t('ui.language')}
        aria-controls={`${id}-panel`}
        aria-busy={busy}
        disabled={disabled}
      >
        <Icon name="translate" />
        {variant === 'text' ? (
          <>
            <span lang={locale}>{languageNames[locale]}</span>
            <Icon name="caretDownFill" className={styles.caret} />
          </>
        ) : (
          <span className={styles.badge} aria-hidden="true">
            {badges[locale]}
          </span>
        )}
      </Dropdown.Toggle>
      <Dropdown.Menu
        id={`${id}-panel`}
        className={styles.menu}
        aria-label={t('ui.languageMenu')}
        align="end"
        popperConfig={preferenceMenuPosition}
      >
        <LanguageOptions locale={locale} busy={busy} onChange={onChange} selectedRef={selected} />
      </Dropdown.Menu>
    </Dropdown>
  );
}
