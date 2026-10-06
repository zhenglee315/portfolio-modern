import { QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createI18n, type Locale } from '@/i18n/config';
import { getQueryClient } from '@/app/query-client';
import { AppearanceProvider } from '@/features/appearance';

type AppProvidersProps = {
  children: ReactNode;
  locale: Locale;
};

/** Own isolated query and translation instances for each mounted application. */
export function AppProviders({ children, locale }: AppProvidersProps) {
  const [queryClient] = useState(getQueryClient);
  const i18n = useMemo(() => createI18n(locale), [locale]);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <AppearanceProvider>{children}</AppearanceProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
