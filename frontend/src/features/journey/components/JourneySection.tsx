import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { queryCopy } from '@/i18n/query-copy';
import { QueryStatus } from '@/shared/ui/QueryStatus';
import { useJourney } from '../api/journey';
import { JourneyView } from './JourneyView';

/** Own full-index fetching while the shared view owns map presentation and interaction. */
export function JourneySection({
  locale,
  suspended = false,
  enabled = true,
}: {
  locale: Locale;
  suspended?: boolean;
  enabled?: boolean;
}) {
  const { t } = useTranslation();
  const query = useJourney(locale, enabled);
  return (
    <JourneyView
      locale={locale}
      items={query.data}
      suspended={suspended}
      status={
        <QueryStatus
          pending={query.isPending}
          failed={query.isError}
          empty={query.data?.length === 0}
          hasData={!!query.data}
          fetching={query.isFetching}
          copy={queryCopy(t, query.error, !!query.data)}
          onRetry={() => void query.refetch()}
        />
      }
    />
  );
}
