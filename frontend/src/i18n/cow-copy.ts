import type { TFunction } from 'i18next';
import type { CowMotionCopy } from '@/shared/ui/cow-workspace/CowMotionControls';

/** Keep locale keys outside the reusable motion controls while sharing all callers' vocabulary. */
export function cowMotionCopy(t: TFunction): CowMotionCopy {
  const toggle = (label: string, tip: string) => ({
    label: t(label),
    start: t(`${tip}Start`),
    stop: t(`${tip}Stop`),
  });
  return {
    group: t('auth.cowPlayback'),
    globeRotating: toggle('auth.cowGlobeRotate', 'auth.cowTips.globe'),
    mouseFollowing: toggle('auth.cowMouseFollow', 'auth.cowTips.mouse'),
    leavesSwaying: toggle('auth.cowLeavesSway', 'auth.cowTips.leaf'),
    eyeTracking: toggle('accessDenied.eyeFollow', 'accessDenied.eye'),
    play: { label: t('auth.cowPlay'), tip: t('auth.cowTips.play') },
    pause: { label: t('auth.cowPause'), tip: t('auth.cowTips.pause') },
  };
}
