import type { Locale } from '@/i18n/config';
import type { Site } from '@/features/site';
import type { Experience } from '@/features/experiences';
import type { Project } from '@/features/projects';
import type { JourneyStop } from '@/features/journey';
import type { Skill, SkillCategory } from '@/features/skills';
import { readProfileContent } from '@/features/profile-content';

export type ProfileContentLocale = {
  locale: Locale;
  site: Site;
  experiences: Experience[];
  projects: Project[];
  journey: JourneyStop[];
  categories: SkillCategory[];
  skills: Record<string, Skill[]>;
};

/** Owner reads reuse the original backend resource classes and include complete hidden content. */
export const loadProfileContent = readProfileContent;
