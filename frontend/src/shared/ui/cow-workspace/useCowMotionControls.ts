import { useState } from 'react';

/** Keep individual preferences while a parent temporarily gates all scene motion. */
export function useCowMotionControls(active = true) {
  const [preferences, setPreferences] = useState({
    playing: true,
    mouseFollowing: true,
    globeRotating: true,
    leavesSwaying: true,
    eyeTracking: true,
  });
  return {
    motion: active && preferences.playing,
    preferences,
    toggle: (key: keyof typeof preferences) =>
      setPreferences((current) => ({ ...current, [key]: !current[key] })),
  };
}
