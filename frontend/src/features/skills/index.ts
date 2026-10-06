export { categoriesSchema, skillsSchema, type Skill, type SkillCategory } from './schemas/skills';
export { categoriesQuery, prefetchCategoryIndex, skillsQuery, useCategories } from './api/skills';
export { SkillsSection } from './components/SkillsSection';
export { assertSkillLabels, categorySkillLabels } from './model/skills';
