import { useEffect, useRef, useState } from 'react';
import { hydrate, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { Locale } from '@/i18n/config';
import { captureLocaleScope, prepareLocale } from '../model/locale';

/** Coordinate last-selection-wins language preparation, cache commit and URL navigation. */
export function useLocaleSwitch(locale: Locale) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const pending = useRef<AbortController | undefined>(undefined);
  const requestId = useRef(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => pending.current?.abort(), []);
  const change = async (target: Locale) => {
    const id = ++requestId.current;
    pending.current?.abort();
    if (target === locale) {
      setBusy(false);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setFailed(false);
    try {
      await client.cancelQueries({ queryKey: ['portfolio', locale] });
      const prepared = await prepareLocale(
        captureLocaleScope(client, locale),
        target,
        controller.signal,
      );
      if (id !== requestId.current || controller.signal.aborted) return;
      await client.cancelQueries({ queryKey: ['portfolio', target] });
      hydrate(client, prepared);
      await navigate(
        { pathname: `/${target}`, search: location.search, hash: location.hash },
        { preventScrollReset: true },
      );
    } catch {
      if (id === requestId.current && !controller.signal.aborted) setFailed(true);
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };
  return { busy, failed, change };
}
