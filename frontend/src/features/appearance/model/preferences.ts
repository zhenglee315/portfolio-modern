export const appearanceKey = 'portfolio-appearance';
export type Theme = 'mint' | 'blue' | 'amber' | 'mist';
export type Appearance = { theme: Theme; speed: number; brightness: number; paused: boolean };

/** Normalize untrusted persisted settings with the legacy bounds and defaults.
 * This self-contained function also runs in the generated first-paint script.
 */
export function normalizeAppearance(raw: unknown): Appearance {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const number = (candidate: unknown, fallback: number, min: number, max: number, step: number) => {
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return fallback;
    return Number((Math.round(Math.min(max, Math.max(min, candidate)) / step) * step).toFixed(1));
  };
  return {
    theme: ['mint', 'blue', 'amber', 'mist'].includes(String(value.theme))
      ? (value.theme as Theme)
      : 'mist',
    speed: number(value.speed, 1, 0.4, 2, 0.1),
    brightness: number(value.brightness, 80, 20, 100, 5),
    paused: typeof value.paused === 'boolean' ? value.paused : false,
  };
}

/** Restore cookie-first preferences; blocked storage and malformed JSON are harmless. */
export function readAppearance(): Appearance {
  if (typeof document === 'undefined') return normalizeAppearance(undefined);
  try {
    const cookie = document.cookie
      .split('; ')
      .find((value) => value.startsWith(`${appearanceKey}=`));
    const raw = cookie
      ? decodeURIComponent(cookie.slice(appearanceKey.length + 1))
      : localStorage.getItem(appearanceKey);
    return normalizeAppearance(raw ? (JSON.parse(raw) as unknown) : undefined);
  } catch {
    return normalizeAppearance(undefined);
  }
}

/** Persist only validated palette/motion values; each storage mechanism can fail independently. */
export function persistAppearance(settings: Appearance) {
  const value = JSON.stringify(normalizeAppearance(settings));
  try {
    document.cookie = `${appearanceKey}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch {
    /* In-memory preferences still work when cookies are blocked. */
  }
  try {
    localStorage.setItem(appearanceKey, value);
  } catch {
    /* Cookies remain the primary persistence mechanism. */
  }
}

/** Trusted script restores first-paint colors before hydration; no API text is inserted. */
export const appearanceBootstrapScript = `(()=>{try{const key="portfolio-appearance";const cookie=document.cookie.split('; ').find(v=>v.startsWith(key+'='));const raw=cookie?decodeURIComponent(cookie.slice(key.length+1)):localStorage.getItem(key);const value=(${normalizeAppearance.toString()})(raw?JSON.parse(raw):undefined);document.documentElement.dataset.theme=value.theme;document.documentElement.style.setProperty('--field-brightness',String(value.brightness/100));}catch{}})();`;
