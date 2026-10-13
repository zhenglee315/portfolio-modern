import { useCallback, useId, useRef, useState } from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/shared/ui/Icon';
import { useDisclosureFocus } from '@/shared/hooks/useDisclosureFocus';
import { AppearanceSettings } from './AppearanceSettings';
import styles from './AppearanceMenu.module.css';

/** Present the legacy appearance disclosure with stable, persistent controls.
 * @param props Optional page-owned callback prioritizing this explicit interaction before opening.
 * @returns A circular trigger and a bounded, nonmodal settings panel.
 * Opening focuses the first range; keyboard dismissal restores the trigger.
 * Focus listeners and scheduled focus are released when the panel closes or unmounts.
 */
export function AppearanceMenu({ onOpen }: { onOpen?: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    first = useRef<HTMLInputElement>(null);
  const id = useId();
  // Value updates preserve the focused control instead of restarting disclosure activation.
  const closeOnBlur = useCallback(() => setOpen(false), []);
  useDisclosureFocus(open, root, first, closeOnBlur);
  return (
    <Dropdown
      ref={root}
      show={open}
      autoClose="outside"
      className={styles.dropdown}
      onToggle={(value, metadata) => {
        if (value) onOpen?.();
        setOpen(value);
        if (!value && metadata.source === 'keydown') trigger.current?.focus();
      }}
    >
      <Dropdown.Toggle
        ref={trigger}
        id={id}
        className="icon-button"
        variant="link"
        aria-label={t('ui.appearance')}
        aria-controls={`${id}-panel`}
      >
        <Icon name="palette" />
      </Dropdown.Toggle>
      <Dropdown.Menu
        id={`${id}-panel`}
        align="end"
        className={styles.menu}
        aria-label={t('ui.settingsTitle')}
        popperConfig={{ modifiers: [{ name: 'offset', options: { offset: [0, 10] } }] }}
      >
        <div className={styles.heading}>
          <strong>{t('ui.appearance')}</strong>
        </div>
        <AppearanceSettings initialRef={first} />
      </Dropdown.Menu>
    </Dropdown>
  );
}
