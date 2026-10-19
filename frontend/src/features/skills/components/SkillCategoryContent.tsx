import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { tagCopy } from '@/i18n/tag-copy';
import { ExpandableTagList } from '@/shared/ui/ExpandableTagList';
import type { Skill } from '../schemas/skills';
import styles from './Skills.module.css';

/** Share the homepage category layout and measured tag disclosure without owning a data source. */
export function SkillCategoryContent({
  id,
  label,
  items,
  total = items.length,
  hasMore = false,
  busy = false,
  error,
  status,
  onLoadMore,
  onPreviewMore,
}: {
  id: string;
  label: string;
  items: Skill[];
  total?: number;
  hasMore?: boolean;
  busy?: boolean;
  error?: string;
  status?: ReactNode;
  onLoadMore?: () => void;
  onPreviewMore?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.row} data-category-id={id}>
      <h3>{label}</h3>
      <div>
        {status}
        <ExpandableTagList
          items={items}
          total={total}
          hasMore={hasMore}
          busy={busy}
          error={error}
          copy={tagCopy(t)}
          onLoadMore={onLoadMore}
          onPreviewMore={onPreviewMore}
        />
      </div>
    </div>
  );
}
