import { QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createI18n, type Locale } from '@/i18n/config';
import { getQueryClient } from '@/app/query-client';
import { AppearanceProvider } from '@/features/appearance';
import { NotificationProvider } from '@/shared/ui/NotificationProvider';
import { NotificationEvents } from './NotificationEvents';

type AppProvidersProps = {
  children: ReactNode;
  locale: Locale;
};

/** Own isolated query and translation instances for each mounted application. */
export function AppProviders({ children, locale }: AppProvidersProps) {
  const [queryClient] = useState(getQueryClient);
  const i18n = useMemo(() => createI18n(locale), [locale]);
  const notificationCopy = useMemo(
    () => ({
      close: i18n.t('notifications.close'),
      labels: {
        success: i18n.t('notifications.labels.success'),
        warning: i18n.t('notifications.labels.warning'),
        error: i18n.t('notifications.labels.error'),
        bug: i18n.t('notifications.labels.bug'),
      },
      defaults: {
        success: i18n.t('notifications.defaults.success'),
        warning: i18n.t('notifications.defaults.warning'),
        error: i18n.t('notifications.defaults.error'),
        bug: i18n.t('notifications.defaults.bug'),
      },
    }),
    [i18n],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <NotificationProvider copy={notificationCopy}>
          <NotificationEvents />
          <AppearanceProvider>{children}</AppearanceProvider>
        </NotificationProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
