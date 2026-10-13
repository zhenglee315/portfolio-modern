import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { tagCopy } from '@/i18n/tag-copy';
import { queryCopy } from '@/i18n/query-copy';
import { usePortfolioContext } from '@/shared/context/portfolio';
import { usePagedCollection } from '@/shared/hooks/usePagedCollection';
import { ApiError } from '@/shared/api/http';
import { ExpandableTagList } from '@/shared/ui/ExpandableTagList';
import { SectionState } from '@/shared/ui/SectionState';
import { skillsQuery, useOwnerSkills, validateOwnerLabels } from '../api/skills';
import type { SkillCategory } from '../schemas/skills';
import styles from './Skills.module.css';

/** Own one category's independent continuation; shared tags never fetch domain data. */
export function SkillCategoryRow({
  category,
  locale,
  updatedAt,
  categories,
  onReload,
  locked = false,
  previewEnabled = true,
}: {
  category: SkillCategory;
  locale: Locale;
  updatedAt: number;
  categories: SkillCategory[];
  onReload: () => void;
  locked?: boolean;
  previewEnabled?: boolean;
}) {
  const { t } = useTranslation();
  const context = usePortfolioContext();
  const query = useOwnerSkills(locale, category, updatedAt);
  const collection = usePagedCollection(
    query,
    skillsQuery(locale, category.id, undefined, context?.site?.site_id, context?.access).queryKey,
    locked,
  );
  const missing = query.error instanceof ApiError && query.error.status === 404;
  let consistent = true;
  try {
    validateOwnerLabels(categories, collection.records);
  } catch {
    consistent = false;
  }
  const copy = queryCopy(t, query.error, !!query.data);
  return (
    <div className={styles.row} data-category-id={category.id}>
      <h3>{category.label}</h3>
      <div>
        {(missing || collection.invalid || !consistent) && (
          <SectionState
            message={t(missing ? 'ui.ownerMissing' : 'ui.invalid')}
            retryLabel={t('ui.reloadSection')}
            onRetry={onReload}
          />
        )}
        <ExpandableTagList
          items={collection.records}
          total={collection.total}
          hasMore={query.hasNextPage}
          busy={query.isFetching || locked}
          error={query.isError ? copy.error : undefined}
          copy={tagCopy(t)}
          onLoadMore={collection.onLoadMore}
          onPreviewMore={
            previewEnabled && !missing && !collection.invalid && consistent
              ? collection.onLoadMore
              : undefined
          }
        />
      </div>
    </div>
  );
}
