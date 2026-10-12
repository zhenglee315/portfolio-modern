import { useHydrated } from '@/shared/hooks/useHydrated';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { cowMotionCopy } from '@/i18n/cow-copy';
import type { Locale } from '@/i18n/config';
import { AppearanceMenu, useAppearance } from '@/features/appearance';
import { LanguageMenu } from '@/features/language';
import { Icon } from '@/shared/ui/Icon';
import { CowMotionControls } from '@/shared/ui/cow-workspace/CowMotionControls';
import { useCowMotionControls } from '@/shared/ui/cow-workspace/useCowMotionControls';
import BackgroundField from '@/shared/ui/background-field/BackgroundField';
import { useAccessDeniedEntrance } from './useAccessDeniedEntrance';
import styles from './AccessDeniedPage.module.css';

import { AccessDeniedCowScene } from './AccessDeniedCowScene';

export { AccessDeniedCowScene, accessDeniedCowArtwork } from './AccessDeniedCowScene';

/** Render a reviewable standalone forbidden page; permission routing is owned by its future caller. */
export function AccessDeniedPage({ locale }: { locale: Locale }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings, motionPaused } = useAppearance();
  const entrance = useAccessDeniedEntrance(motionPaused);
  const controls = useCowMotionControls(!motionPaused);
  const { mouseFollowing, globeRotating, leavesSwaying, eyeTracking } = controls.preferences;
  const mounted = useHydrated();
  return (
    <div
      className={styles.page}
      data-bs-theme={!mounted || settings.theme === 'mist' ? 'light' : 'dark'}
      data-auth-view="true"
      data-auth-phase={entrance.phase}
      style={entrance.style}
    >
      <BackgroundField
        copy={{ unavailable: t('ui.unavailable'), retry: t('ui.retry') }}
        paused={motionPaused}
        speed={settings.speed}
        compact={false}
      />
      <header className={styles.header}>
        <Link className={styles.brand} to={`/${locale}`}>
          <Icon name="dashboard" />
          <span>PORTFOLIO</span>
        </Link>
        <div className={styles.controls}>
          <AppearanceMenu />
          <LanguageMenu
            locale={locale}
            busy={false}
            onChange={(language) => void navigate(`/${language}/access-denied`)}
          />
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.illustration}>
          <AccessDeniedCowScene
            label={t('accessDenied.artwork')}
            motion={mounted && controls.motion}
            parallax={mouseFollowing}
            globeRotation={globeRotating}
            leafMotion={leavesSwaying}
            eyeTracking={eyeTracking}
          />
          <div className={styles.cowControls}>
            <CowMotionControls copy={cowMotionCopy(t)} controls={controls} eyes />
          </div>
        </div>
        <section className={styles.copy} aria-labelledby="access-denied-title">
          <p className={styles.status}>
            <span className={styles.code}>403</span>
            <span className={styles.eyebrow}>{t('accessDenied.eyebrow')}</span>
          </p>
          <h1 id="access-denied-title">{t('accessDenied.title')}</h1>
          <p className={styles.description}>{t('accessDenied.description')}</p>
          <Link className={styles.home} to={`/${locale}`}>
            <Icon name="home" />
            {t('accessDenied.backHome')}
          </Link>
        </section>
      </main>
    </div>
  );
}
