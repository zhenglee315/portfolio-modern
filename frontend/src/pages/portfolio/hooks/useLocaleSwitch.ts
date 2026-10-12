import { useEffect, useRef, useState } from 'react';
import { hydrate, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '@/shared/ui/NotificationProvider';
import type { Locale } from '@/i18n/config';
import { captureLocaleScope, prepareLocale } from '../model/locale';
import { cancelPortfolioQueries, type PortfolioSiteSelector } from '@/shared/api/portfolio';

/** Coordinate last-selection-wins language preparation, cache commit and URL navigation.
 * @param locale Currently rendered language.
 * @param selector Public handle or query-string ID retained through Site reads and cache cancellation.
 * @param siteId Resolved ID shared by all loaded content ranges.
 * @returns Language preparation state and an action preserving the URL's search and fragment.
 */
export function useLocaleSwitch(
  locale: Locale,
  selector: PortfolioSiteSelector = {},
  siteId?: number,
) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { notify } = useNotifications();
  const pending = useRef<AbortController | undefined>(undefined);
  const requestId = useRef(0);
  const [busy, setBusy] = useState(false);
  useEffect(
    () => () => {
      pending.current?.abort();
      requestId.current++;
    },
    [selector.user, selector.site_id, siteId],
  );
  const change = async (target: Locale) => {
    const id = ++requestId.current;
    pending.current?.abort();
    if (target === locale) {
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      await cancelPortfolioQueries(client, locale, selector, siteId);
      const prepared = await prepareLocale(
        captureLocaleScope(client, locale, selector, siteId),
        target,
        controller.signal,
      );
      if (id !== requestId.current || controller.signal.aborted) return;
      await cancelPortfolioQueries(client, target, selector, siteId);
      hydrate(client, prepared);
      await navigate(
        {
          pathname: `/${target}${selector.user ? `/${selector.user}` : ''}`,
          search: location.search,
          hash: location.hash,
        },
        { preventScrollReset: true },
      );
      if (id === requestId.current && !controller.signal.aborted)
        notify({
          kind: 'success',
          message: i18n.getFixedT(target)('notifications.languageChanged'),
        });
    } catch {
      if (id === requestId.current && !controller.signal.aborted)
        notify({ kind: 'warning', message: t('notifications.languageFailed') });
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };
  return { busy, change };
}
