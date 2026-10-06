import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { queryCopy } from '@/i18n/query-copy';
import { usePagedCollection } from '@/shared/hooks/usePagedCollection';
import { QueryStatus } from '@/shared/ui/QueryStatus';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { SectionState } from '@/shared/ui/SectionState';
import { categoriesQuery, useCategories } from '../api/skills';
import { SkillCategoryRow } from './SkillCategoryRow';
import styles from './Skills.module.css';

/** Show all categories in one toolkit while retaining independent owner disclosures.
 * Category pages continue automatically; a failed append retains validated rows and offers retry.
 */
export function SkillsSection({ locale, locked = false }: { locale: Locale; locked?: boolean }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const query = useCategories(locale);
  const collection = usePagedCollection(query, categoriesQuery(locale).queryKey, locked);
  const copy = queryCopy(t, query.error, !!query.data);
  const { onLoadMore } = collection;
  // Categories are visible by default; pagination is transport, not a six-row disclosure.
  useEffect(() => {
    if (query.hasNextPage && !query.isFetching && !query.isError && !locked) onLoadMore();
  }, [query.hasNextPage, query.isFetching, query.isError, locked, onLoadMore]);
  const reload = () => {
    client.removeQueries({ queryKey: ['portfolio', locale, 'skills'] });
    void client.resetQueries({ queryKey: categoriesQuery(locale).queryKey, exact: true });
  };
  return (
    <>
      <SectionHeader eyebrow={t('ui.skillsEyebrow')} title={t('ui.skillsTitle')} />
      <QueryStatus
        {...collection.status}
        copy={{ ...copy, retry: collection.invalid ? t('ui.reloadSection') : copy.retry }}
      />
      {!!collection.records.length && (
        <div className={styles.toolkit} data-skill-categories>
          {collection.records.map((category) => (
            <SkillCategoryRow
              key={category.id}
              category={category}
              locked={locked}
              locale={locale}
              updatedAt={query.dataUpdatedAt}
              categories={collection.records}
              onReload={reload}
            />
          ))}
        </div>
      )}
      {query.hasNextPage && !collection.invalid && (
        <SectionState
          message={query.isFetchNextPageError ? copy.error : copy.loading}
          busy={query.isFetchingNextPage || locked}
          retryLabel={query.isFetchNextPageError ? copy.retry : undefined}
          onRetry={query.isFetchNextPageError ? onLoadMore : undefined}
        />
      )}
    </>
  );
}
