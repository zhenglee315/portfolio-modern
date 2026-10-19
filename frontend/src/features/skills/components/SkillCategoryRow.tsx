import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { queryCopy } from '@/i18n/query-copy';
import { usePortfolioContext } from '@/shared/context/portfolio';
import { usePagedCollection } from '@/shared/hooks/usePagedCollection';
import { ApiError } from '@/shared/api/http';
import { SectionState } from '@/shared/ui/SectionState';
import { skillsQuery, useOwnerSkills, validateOwnerLabels } from '../api/skills';
import type { SkillCategory } from '../schemas/skills';
import { SkillCategoryContent } from './SkillCategoryContent';

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
    <SkillCategoryContent
      id={category.id}
      label={category.label}
      items={collection.records}
      total={collection.total}
      hasMore={query.hasNextPage}
      busy={query.isFetching || locked}
      error={query.isError ? copy.error : undefined}
      onLoadMore={collection.onLoadMore}
      onPreviewMore={
        previewEnabled && !missing && !collection.invalid && consistent
          ? collection.onLoadMore
          : undefined
      }
      status={
        (missing || collection.invalid || !consistent) && (
          <SectionState
            message={t(missing ? 'ui.ownerMissing' : 'ui.invalid')}
            retryLabel={t('ui.reloadSection')}
            onRetry={onReload}
          />
        )
      }
    />
  );
}
