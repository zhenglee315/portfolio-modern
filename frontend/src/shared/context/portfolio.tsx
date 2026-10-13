import { createContext, useContext, type ReactNode } from 'react';
import type { PortfolioAccess, PortfolioSiteSelector } from '@/shared/api/portfolio';

type PortfolioContextValue = {
  selector: PortfolioSiteSelector;
  site?: { site_id: number; user: string };
  access?: PortfolioAccess;
};
const PortfolioContext = createContext<PortfolioContextValue | undefined>(undefined);

/** Share resolved public ownership while domain DTOs remain in their feature query caches. */
export function PortfolioProvider({
  selector,
  site,
  access = 'public',
  children,
}: PortfolioContextValue & { children: ReactNode }) {
  return (
    <PortfolioContext.Provider value={{ selector, site, access }}>
      {children}
    </PortfolioContext.Provider>
  );
}

/** Read optional page coordination without coupling independent domain features. */
export function usePortfolioContext() {
  return useContext(PortfolioContext);
}

/** Pin subsection reads to the resolved Site and share the unresolved-identity guard.
 * @param enabled Demand owned by the page or section rather than by the account session.
 * @returns The resolved content identity and effective query activation policy.
 * Standalone feature consumers retain default reads; a coordinated page waits for its Site.
 */
export function usePortfolioScope(enabled = true) {
  const context = usePortfolioContext();
  return {
    siteId: context?.site?.site_id,
    access: context?.access,
    enabled: enabled && (!context || !!context.site),
  };
}
