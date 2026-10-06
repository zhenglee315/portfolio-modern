import { useEffect, useRef } from 'react';
import type { Theme } from '../model/preferences';
import { createThemeTransition } from '../model/transition';
import styles from '../components/ThemeTransition.module.css';

/** Bind one palette paint controller to provider lifetime and existing accessibility/visibility policy. */
export function useThemeTransition(theme: Theme, reduced: boolean, visible: boolean) {
  const controller = useRef<ReturnType<typeof createThemeTransition> | null>(null);
  useEffect(() => {
    const next = createThemeTransition(document, styles.veil!);
    controller.current = next;
    return () => {
      next.dispose();
      controller.current = null;
    };
  }, []);
  useEffect(() => {
    controller.current?.apply(theme, !reduced && visible);
  }, [theme, reduced, visible]);
}
