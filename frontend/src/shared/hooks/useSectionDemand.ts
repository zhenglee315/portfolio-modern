import { useEffect, useState } from 'react';
import { observeViewport } from '@/shared/lib/viewport';

/** Activate a section's bounded reads near the viewport or through its direct fragment link.
 * @param id Stable page anchor; observers are recreated when the public identity changes.
 * @param identity Resolved site and language scope, independent of session identity.
 * @param enabled Pause new section reads while the account surface owns the screen.
 * @param requested Prioritize an explicit navigation before its scroll reaches the section.
 */
export function useSectionDemand(id: string, identity: string, enabled = true, requested = false) {
  const [activated, setActivated] = useState<string>();
  useEffect(() => {
    if (!enabled) return;
    const target = document.getElementById(id);
    if (!target) return;
    const activate = () => setActivated(identity);
    if (requested) activate();
    const directLink = () => {
      if (location.hash === `#${id}`) activate();
    };
    directLink();
    const disconnect = observeViewport(
      target,
      (visible) => {
        if (visible) activate();
      },
      '200px',
    );
    window.addEventListener('hashchange', directLink);
    window.addEventListener('popstate', directLink);
    return () => {
      disconnect();
      window.removeEventListener('hashchange', directLink);
      window.removeEventListener('popstate', directLink);
    };
  }, [id, identity, enabled, requested]);
  return enabled && (activated === identity || requested);
}
