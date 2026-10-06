import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  normalizeAppearance,
  readAppearance,
  persistAppearance,
  type Appearance,
} from '../model/preferences';
import { reducedMotionQuery, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useDocumentVisible } from '@/shared/hooks/useDocumentVisible';
import { useThemeTransition } from './useThemeTransition';
import type { ThemeTransitionPhase } from '../model/transition';

type Preferences = {
  settings: Appearance;
  reducedMotion: boolean;
  motionPaused: boolean;
  subscribeThemeTransition: (listener: (phase: ThemeTransitionPhase) => void) => () => void;
  update: (patch: Partial<Appearance>) => void;
  reset: () => void;
};
const Context = createContext<Preferences | undefined>(undefined);

/** Own validated non-sensitive preferences and their document/style side effects. */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(readAppearance);
  const reducedMotion = useMediaQuery(reducedMotionQuery);
  const visible = useDocumentVisible();
  const motionPaused = settings.paused || reducedMotion || !visible;
  const subscribeThemeTransition = useThemeTransition(settings.theme, reducedMotion, visible);
  const update = useCallback(
    (patch: Partial<Appearance>) =>
      setSettings((previous) => normalizeAppearance({ ...previous, ...patch })),
    [],
  );
  const reset = useCallback(() => setSettings(normalizeAppearance(undefined)), []);
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--field-brightness',
      String(settings.brightness / 100),
    );
    persistAppearance(settings);
  }, [settings]);
  useEffect(() => {
    document.documentElement.dataset.motionPaused = String(motionPaused);
  }, [motionPaused]);
  const value = useMemo(
    () => ({ settings, reducedMotion, motionPaused, subscribeThemeTransition, update, reset }),
    [settings, reducedMotion, motionPaused, subscribeThemeTransition, update, reset],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Access preferences through composition instead of importing another feature's internals. */
export function useAppearance() {
  const value = useContext(Context);
  if (!value) throw new Error('Appearance provider is required.');
  return value;
}
