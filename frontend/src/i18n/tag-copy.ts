import type { TFunction } from 'i18next';
import type { TagCopy } from '@/shared/ui/ExpandableTagList';

/** Supply the same disclosure vocabulary to complete and paginated skill lists. */
export function tagCopy(t: TFunction): TagCopy {
  return {
    more: (count) => t(count === 1 ? 'ui.showSkill' : 'ui.showSkills', { count }),
    compact: (count) => t(count === 1 ? 'ui.moreSkill' : 'ui.moreSkills', { count }),
    less: t('ui.lessSkills'),
    lessLabel: t('ui.lessSkillsLabel'),
    load: t('ui.moreSkillPage'),
    loading: t('ui.loading'),
  };
}
