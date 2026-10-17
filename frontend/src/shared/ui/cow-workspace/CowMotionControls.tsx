import { CowControl } from './CowControl';
import styles from './CowMotionControls.module.css';
import type { useCowMotionControls } from './useCowMotionControls';

const toggles = [
  {
    key: 'globeRotating',
    icon: 'globeAmericas',
  },
  {
    key: 'mouseFollowing',
    icon: 'mouse2',
  },
  { key: 'leavesSwaying', icon: 'leafFill' },
  { key: 'eyeTracking', icon: 'eye' },
] as const;

type ToggleCopy = { label: string; start: string; stop: string };
export type CowMotionCopy = {
  group: string;
  globeRotating: ToggleCopy;
  mouseFollowing: ToggleCopy;
  leavesSwaying: ToggleCopy;
  eyeTracking: ToggleCopy;
  play: { label: string; tip: string };
  pause: { label: string; tip: string };
};

/** Render injected control copy without depending on account state, language keys or routes. */
export function CowMotionControls({
  controls: { preferences, toggle },
  copy,
  eyes = false,
}: {
  controls: ReturnType<typeof useCowMotionControls>;
  copy: CowMotionCopy;
  eyes?: boolean;
}) {
  const playback = preferences.playing ? copy.pause : copy.play;
  return (
    <div className={styles.row} role="group" aria-label={copy.group}>
      {toggles.map((item) =>
        item.key === 'eyeTracking' && !eyes ? null : (
          <CowControl
            key={item.key}
            icon={item.icon}
            label={copy[item.key].label}
            text={preferences[item.key] ? copy[item.key].stop : copy[item.key].start}
            pressed={preferences[item.key]}
            onClick={() => toggle(item.key)}
          />
        ),
      )}
      <CowControl
        icon={preferences.playing ? 'pause' : 'play'}
        label={playback.label}
        text={playback.tip}
        onClick={() => toggle('playing')}
      />
    </div>
  );
}
