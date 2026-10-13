import { useId, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/shared/ui/Icon';
import { useAppearance } from '../hooks/AppearanceProvider';
import type { Theme } from '../model/preferences';
import styles from './AppearanceSettings.module.css';

const themes: Theme[] = ['mint', 'blue', 'amber', 'mist'];

/** Share persistent appearance controls between the gear panel and standalone disclosure. */
export function AppearanceSettings({
  initialRef,
}: {
  initialRef?: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation();
  const { settings, reducedMotion, update, reset } = useAppearance();
  const id = useId();
  return (
    <div className={styles.controls}>
      <label htmlFor={`${id}-speed`}>
        {t('ui.speed')}
        <output htmlFor={`${id}-speed`}>{settings.speed.toFixed(1)}×</output>
      </label>
      <input
        ref={initialRef}
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
    </div>
  );
}
