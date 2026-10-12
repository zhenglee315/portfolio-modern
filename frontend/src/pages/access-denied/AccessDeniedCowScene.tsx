import { CowWorkspace } from '@/shared/ui/cow-workspace/CowWorkspace';
import { DeniedCowCharacter } from '@/shared/ui/cow-workspace/DeniedCowCharacter';
import { DENIED_EYES } from '@/assets/cow-workspace/access-denied/eyes';
import styles from './AccessDeniedCowScene.module.css';

export const accessDeniedCowArtwork = { eyes: DENIED_EYES };

/** Standalone review illustration composed from the approved desk, cow rig and three new layers. */
export function AccessDeniedCowScene({
  label,
  motion = true,
  parallax = true,
  globeRotation = true,
  leafMotion = true,
  eyeTracking = true,
}: {
  label: string;
  motion?: boolean;
  parallax?: boolean;
  globeRotation?: boolean;
  leafMotion?: boolean;
  eyeTracking?: boolean;
}) {
  return (
    <div
      className={styles.scene}
      role="img"
      aria-label={label}
      data-access-denied-cow=""
      data-motion={motion ? 'true' : 'false'}
    >
      <div aria-hidden="true">
        <CowWorkspace
          label={label}
          motion={motion}
          parallax={parallax}
          globeRotation={globeRotation}
          leafMotion={leafMotion}
          pointerScope="page"
          phase="glance"
          codingEffects
          character={<DeniedCowCharacter motion={motion && eyeTracking} />}
        />
      </div>
    </div>
  );
}
