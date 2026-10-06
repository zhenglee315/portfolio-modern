import { useCallback, useId, useRef, useState } from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/shared/ui/Icon';
import { useDisclosureFocus } from '@/shared/hooks/useDisclosureFocus';
import { useAppearance } from '../hooks/AppearanceProvider';
import type { Theme } from '../model/preferences';
import styles from './AppearanceMenu.module.css';

const themes: Theme[] = ['mint', 'blue', 'amber', 'mist'];

/** Present the legacy appearance disclosure with stable, persistent controls.
 * @param props Optional page-owned callback prioritizing this explicit interaction before opening.
 * @returns A circular trigger and a bounded, nonmodal settings panel.
 * Opening focuses the first range; keyboard dismissal restores the trigger.
 * Focus listeners and scheduled focus are released when the panel closes or unmounts.
 */
export function AppearanceMenu({ onOpen }: { onOpen?: () => void }) {
  const { t } = useTranslation();
  const { settings, reducedMotion, update, reset } = useAppearance();
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
        <label htmlFor={`${id}-speed`}>
          {t('ui.speed')}
          <output htmlFor={`${id}-speed`}>{settings.speed.toFixed(1)}×</output>
        </label>
        <input
          ref={first}
          id={`${id}-speed`}
          type="range"
          min="0.4"
          max="2"
          step="0.1"
          value={settings.speed}
          onChange={(event) => update({ speed: Number(event.target.value) })}
        />
        <label htmlFor={`${id}-brightness`}>
          {t('ui.brightness')}
          <output htmlFor={`${id}-brightness`}>{settings.brightness}%</output>
        </label>
        <input
          id={`${id}-brightness`}
          type="range"
          min="20"
          max="100"
          step="5"
          value={settings.brightness}
          onChange={(event) => update({ brightness: Number(event.target.value) })}
        />
        <div className={styles.palette} role="group" aria-label={t('ui.palette')}>
          {themes.map((theme) => (
            <button
              type="button"
              key={theme}
              data-theme-option={theme}
              aria-pressed={settings.theme === theme}
              onClick={() => update({ theme })}
            >
              <i aria-hidden="true" />
              {t(`ui.theme${theme}`)}
            </button>
          ))}
        </div>
        {reducedMotion && <p>{t('ui.reducedMotionNote')}</p>}
        <div className={styles.actions}>
          <button
            type="button"
            disabled={reducedMotion}
            aria-pressed={settings.paused || reducedMotion}
            onClick={() => update({ paused: !settings.paused })}
          >
            <Icon name={settings.paused || reducedMotion ? 'play' : 'pause'} />
            {t(settings.paused || reducedMotion ? 'ui.playBackground' : 'ui.pauseBackground')}
          </button>
          <button type="button" onClick={reset}>
            <Icon name="restart" />
            {t('ui.resetAppearance')}
          </button>
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
