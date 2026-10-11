import { useEffect, useRef, useState } from 'react';

const maximumDuration = 5 * 60 * 1000;
const storageKey = 'portfolio-verification-cooldown';
type Cooldown = { expiresAt: number; remaining: number };

/** Restore only a valid deadline, never an email or credential. SSR has no active cooldown. */
function readCooldown(): Cooldown {
  if (typeof window !== 'undefined') {
    try {
      const expiresAt = Number(window.sessionStorage.getItem(storageKey));
      const remaining = expiresAt - Date.now();
      if (Number.isFinite(expiresAt) && remaining > 0 && remaining <= maximumDuration) {
        return { expiresAt, remaining: Math.ceil(remaining / 1000) };
      }
    } catch {
      // Storage restrictions still allow an in-memory cooldown for this mounted panel.
    }
  }
  return { expiresAt: 0, remaining: 0 };
}

/**
 * Rate-limit the UI action across mode changes and reloads in this tab.
 * Use the server-provided deadline so background timer throttling does not extend the wait.
 * The delivery endpoint enforces its own rate limit.
 */
export function useVerificationCooldown() {
  const [cooldown, setCooldown] = useState(readCooldown);
  const deadline = useRef(cooldown.expiresAt);

  useEffect(() => {
    if (!cooldown.expiresAt) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((cooldown.expiresAt - Date.now()) / 1000));
      if (!remaining) {
        deadline.current = 0;
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {
          // Expiry also works when browser storage is unavailable.
        }
      }
      setCooldown({ expiresAt: remaining ? cooldown.expiresAt : 0, remaining });
    };
    const timer = window.setInterval(update, 1000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [cooldown.expiresAt]);

  const start = (seconds = 60) => {
    const now = Date.now();
    if (Math.max(deadline.current, readCooldown().expiresAt) > now) return false;
    const duration = Math.min(maximumDuration, Math.max(0, seconds) * 1000);
    if (!Number.isFinite(duration) || !duration) return false;
    const expiresAt = now + duration;
    deadline.current = expiresAt;
    try {
      window.sessionStorage.setItem(storageKey, String(expiresAt));
    } catch {
      // Keep the button disabled in memory when storage is blocked.
    }
    setCooldown({ expiresAt, remaining: duration / 1000 });
    return true;
  };

  return { remaining: cooldown.remaining, start };
}
