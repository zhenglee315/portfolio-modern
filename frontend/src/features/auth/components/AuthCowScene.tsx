import { lazy, Suspense, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { PixelTooltip } from '@/shared/ui/PixelTooltip';
import { SectionBoundary } from '@/shared/ui/SectionBoundary';
import { useHoverTooltip } from '@/shared/hooks/useHoverTooltip';
import type { CowWorkspacePhase } from '@/shared/hooks/useCowWorkspaceMotion';
import styles from './AuthCowScene.module.css';

const CowWorkspace = lazy(() =>
  import('@/shared/ui/cow-workspace/CowWorkspace').then((module) => ({
    default: module.CowWorkspace,
  })),
);

type CowMode = 'cycle' | CowWorkspacePhase;

const modes = [
  { mode: 'cycle', icon: 'repeat', label: 'cowCycle', tip: 'cycle' },
  { mode: 'thinking', icon: 'cupHot', label: 'cowThinking', tip: 'thinking' },
  { mode: 'typing', icon: 'dpad', label: 'cowCoding', tip: 'coding' },
  { mode: 'glance', icon: 'balloon', label: 'cowWatching', tip: 'hello' },
] as const;

/**
 * Share localized accessible labels and short pixel tips across cow controls.
 * Omit pressed for actions such as playback; clicks close the tip before invoking onClick.
 * The shared tooltip hook owns its listeners and cleanup.
 */
function CowControl({
  icon,
  label,
  text,
  pressed,
  onClick,
}: {
  icon: IconName;
  label: string;
  text: string;
  pressed?: boolean;
  onClick: () => void;
}) {
  const tooltip = useHoverTooltip();
  return (
    <>
      <button
        {...tooltip.triggerProps}
        type="button"
        className={`icon-button ${styles.control}`}
        aria-label={label}
        aria-pressed={pressed}
        onClick={() => {
          tooltip.close();
          onClick();
        }}
      >
        <Icon name={icon} />
      </button>
      {tooltip.tooltipProps && (
        <PixelTooltip {...tooltip.tooltipProps} text={text} placement="above" />
      )}
    </>
  );
}

/**
 * Own expression, playback, mouse and globe preferences while reusing the shared scene clock.
 * active gates motion without replacing preferences; pointerOrigin anchors full-page tracking.
 * Keep this outside mode-keyed forms so account-mode changes retain these preferences.
 */
export function AuthCowScene({
  active = true,
  pointerOrigin,
}: {
  active?: boolean;
  pointerOrigin?: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<CowMode>('cycle');
  const [playing, setPlaying] = useState(true);
  const [mouseFollowing, setMouseFollowing] = useState(true);
  const [globeRotating, setGlobeRotating] = useState(true);
  const motion = active && playing;
  const placeholder = <div className={styles.scene} aria-hidden="true" />;

  return (
    <div className={styles.root} data-auth-cow>
      <div className={styles.modes} role="group" aria-label={t('auth.cowModes')}>
        {modes.map((item) => (
          <CowControl
            key={item.mode}
            icon={item.icon}
            label={t(`auth.${item.label}`)}
            text={t(`auth.cowTips.${item.tip}`)}
            pressed={mode === item.mode}
            onClick={() => setMode(item.mode)}
          />
        ))}
      </div>

      <SectionBoundary
        resetKey="auth-cow"
        message={t('ui.unavailable')}
        retryLabel={t('ui.retry')}
        fallback={placeholder}
        silent
      >
        <Suspense fallback={placeholder}>
          <CowWorkspace
            label={t('auth.cowLabel')}
            className={styles.scene}
            phase={mode === 'cycle' ? undefined : mode}
            motion={motion}
            parallax={motion && mouseFollowing}
            pointerScope="page"
            pointerOrigin={pointerOrigin}
            globeRotation={globeRotating}
          />
        </Suspense>
      </SectionBoundary>

      <div className={styles.playback} role="group" aria-label={t('auth.cowPlayback')}>
        <CowControl
          icon="globeAmericas"
          label={t('auth.cowGlobeRotate')}
          text={t(globeRotating ? 'auth.cowTips.globeStop' : 'auth.cowTips.globeStart')}
          pressed={globeRotating}
          onClick={() => setGlobeRotating((rotating) => !rotating)}
        />
        <CowControl
          icon="mouse2"
          label={t('auth.cowMouseFollow')}
          text={t(mouseFollowing ? 'auth.cowTips.mouseStop' : 'auth.cowTips.mouseStart')}
          pressed={mouseFollowing}
          onClick={() => setMouseFollowing((following) => !following)}
        />
        <CowControl
          icon={playing ? 'pause' : 'play'}
          label={t(playing ? 'auth.cowPause' : 'auth.cowPlay')}
          text={t(playing ? 'auth.cowTips.pause' : 'auth.cowTips.play')}
          onClick={() => setPlaying((current) => !current)}
        />
      </div>
    </div>
  );
}
