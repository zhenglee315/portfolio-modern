import { useEffect, useState, type CSSProperties } from 'react';
import type { ProfileSection } from '@/features/profile-content';
import { reducedMotionQuery, useMediaQuery } from '@/shared/hooks/useMediaQuery';

type ProfileView = { section: ProfileSection; editing: string | null };
const fadeDuration = 180;
const fadeStyle = { '--profile-view-fade': `${fadeDuration}ms` } as CSSProperties;

/** Keep the outgoing view mounted until it fades; the account-owned draft stays above this hook. */
export function useProfileViewFade(section: ProfileSection, editing: string | null) {
  const reduced = useMediaQuery(reducedMotionQuery);
  const [view, setView] = useState({ section, editing, fading: false });

  useEffect(() => {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      const target: ProfileView = { section, editing };
      if (reduced || (view.section === section && view.editing === editing)) {
        // Selecting the current view cancels an unfinished departure without resetting its inputs.
        setView((current) =>
          !current.fading && current.section === section && current.editing === editing
            ? current
            : { ...target, fading: false },
        );
        return;
      }
      setView((current) => ({ ...current, fading: true }));
      // Allow two paint frames after the CSS fade so content changes only once fully transparent.
      deadline = setTimeout(() => {
        setView({ ...target, fading: false });
      }, fadeDuration + 32);
    });
    return () => {
      // Rapid selections, history navigation and unmounts retire the previous destination.
      cancelAnimationFrame(frame);
      clearTimeout(deadline);
    };
  }, [section, editing, reduced, view.section, view.editing]);

  return { ...view, style: fadeStyle };
}
