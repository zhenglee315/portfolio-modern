import { lazy, Suspense, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { cowMotionCopy } from '@/i18n/cow-copy';
import { CowControl } from '@/shared/ui/cow-workspace/CowControl';
import { CowMotionControls } from '@/shared/ui/cow-workspace/CowMotionControls';
import { useCowMotionControls } from '@/shared/ui/cow-workspace/useCowMotionControls';
import { PixelBubble } from '@/shared/ui/PixelBubble';
import { SectionBoundary } from '@/shared/ui/SectionBoundary';
import type { CowWorkspacePhase } from '@/shared/hooks/useCowWorkspaceMotion';
import styles from './AuthCowScene.module.css';

const CowWorkspace = lazy(() =>
  import('@/shared/ui/cow-workspace/CowWorkspace').then((module) => ({
    default: module.CowWorkspace,
  })),
);

const DeniedCowCharacter = lazy(() =>
  import('@/shared/ui/cow-workspace/DeniedCowCharacter').then((module) => ({
    default: module.DeniedCowCharacter,
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
 * Own expression, playback, mouse and globe preferences while reusing the shared scene clock.
 * active gates motion without replacing preferences; pointerOrigin anchors full-page tracking.
 * Keep this outside mode-keyed forms so account-mode changes retain these preferences.
 * welcome temporarily shows the watching pose without changing stored controls or motion policy.
 * denied swaps only the character; the workspace clock, selected phase and preferences persist.
 */
export function AuthCowScene({
  active = true,
  welcome = false,
  denied = false,
  pointerOrigin,
}: {
  active?: boolean;
  welcome?: boolean;
  denied?: boolean;
  pointerOrigin?: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<CowMode>('cycle');
  const controls = useCowMotionControls(active);
  const { motion, preferences } = controls;
  const phase = welcome ? 'glance' : mode === 'cycle' ? undefined : mode;
  const placeholder = <div className={styles.scene} aria-hidden="true" />;

  return (
    <div
      className={styles.root}
      data-auth-cow
      data-welcome={welcome || undefined}
      data-auth-cow-denied={denied || undefined}
    >
      <div className={styles.modes} role="group" aria-label={t('auth.cowModes')}>
        {modes.map((item) => (
          <CowControl
            key={item.mode}
            icon={item.icon}
            label={t(`auth.${item.label}`)}
            text={t(`auth.cowTips.${item.tip}`)}
            pressed={welcome ? item.mode === 'glance' : mode === item.mode}
            onClick={() => setMode(item.mode)}
          />
        ))}
      </div>

      <div className={styles.stage}>
        <SectionBoundary
          resetKey="auth-cow"
          message={t('ui.unavailable')}
          retryLabel={t('ui.retry')}
          fallback={placeholder}
          silent
        >
          <Suspense fallback={placeholder}>
            <CowWorkspace
              label={t(denied ? 'accessDenied.artwork' : 'auth.cowLabel')}
              className={styles.scene}
              phase={phase}
              motion={motion}
              parallax={motion && preferences.mouseFollowing}
              pointerScope="page"
              pointerOrigin={pointerOrigin}
              globeRotation={preferences.globeRotating}
              leafMotion={preferences.leavesSwaying}
              codingEffects={denied}
              character={
                denied ? (
                  <DeniedCowCharacter motion={motion && preferences.eyeTracking} />
                ) : undefined
              }
            />
            {welcome && (
              <PixelBubble
                className={styles.welcome}
                data-auth-cow-welcome
                role="status"
                aria-atomic="true"
              >
                {t('auth.welcome')}
              </PixelBubble>
            )}
          </Suspense>
        </SectionBoundary>
      </div>

      <div className={styles.playback}>
        <CowMotionControls copy={cowMotionCopy(t)} controls={controls} />
      </div>
    </div>
  );
}
