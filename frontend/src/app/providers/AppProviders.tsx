import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createI18n, type Locale } from '@/i18n/config';

type AppProvidersProps = {
  children: ReactNode;
  locale: Locale;
};

/** Own isolated query and translation instances for each mounted application. */
export function AppProviders({ children, locale }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, retry: 1 },
        },
      }),
  );
  const i18n = useMemo(() => createI18n(locale), [locale]);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}
