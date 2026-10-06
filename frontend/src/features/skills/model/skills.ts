import { ApiError } from '@/shared/api/http';
import type { Skill, SkillCategory } from '../schemas/skills';

/** Verify that shared skill identities keep a single label within a locale snapshot. */
export function assertSkillLabels(groups: Skill[][]) {
  const labels = new Map<string, string>();
  for (const skill of groups.flat()) {
    const previous = labels.get(skill.id);
    if (previous !== undefined && previous !== skill.label) throw new ApiError('contract');
    labels.set(skill.id, skill.label);
  }
  return labels;
}

/** Derive category-preview lookup without storing another synchronized skill entity map. */
export function categorySkillLabels(categories: SkillCategory[]) {
  return assertSkillLabels(categories.map((category) => category.skills.items));
}
