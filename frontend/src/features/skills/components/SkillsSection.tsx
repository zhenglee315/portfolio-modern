import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { queryCopy } from '@/i18n/query-copy';
import { portfolioKey } from '@/shared/api/portfolio';
import { usePortfolioContext } from '@/shared/context/portfolio';
import { usePagedCollection } from '@/shared/hooks/usePagedCollection';
import { QueryStatus } from '@/shared/ui/QueryStatus';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { LoadMoreControl } from '@/shared/ui/LoadMoreControl';
import { categoriesQuery, useCategories } from '../api/skills';
import { SkillCategoryRow } from './SkillCategoryRow';
import styles from './Skills.module.css';

/** Show bounded category pages with independent skill disclosures and explicit continuation.
 * A failed append retains validated rows; page two is read only when requested.
 */
export function SkillsSection({
  locale,
  locked = false,
  enabled = true,
}: {
  locale: Locale;
  locked?: boolean;
  enabled?: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const context = usePortfolioContext();
  const siteId = context?.site?.site_id;
  const query = useCategories(locale, enabled);
  const collection = usePagedCollection(
    query,
    categoriesQuery(locale, undefined, siteId).queryKey,
    locked,
  );
  const copy = queryCopy(t, query.error, !!query.data);
  const { onLoadMore } = collection;
  const reload = () => {
    client.removeQueries({ queryKey: [...portfolioKey(locale, { site_id: siteId }), 'skills'] });
    void client.resetQueries({
      queryKey: categoriesQuery(locale, undefined, siteId).queryKey,
      exact: true,
    });
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
              previewEnabled={enabled}
              locale={locale}
              updatedAt={query.dataUpdatedAt}
              categories={collection.records}
              onReload={reload}
            />
          ))}
        </div>
      )}
      {query.hasNextPage && !collection.invalid && (
        <LoadMoreControl
          label={t('ui.moreCategories')}
          busyLabel={t('ui.loading')}
          error={query.isFetchNextPageError ? copy.error : undefined}
          busy={query.isFetchingNextPage || locked}
          onLoad={onLoadMore}
        />
      )}
    </>
  );
}
