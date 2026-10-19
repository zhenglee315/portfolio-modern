import type { Locale } from '@/i18n/config';
import type { ProfileDraft, ProfileExperience, ProfileProject } from '@/features/profile-content';
import type { Site } from '@/features/site';
import { experienceSchema } from '@/features/experiences';
import { projectSchema } from '@/features/projects';
import { journeyItemSchema } from '@/features/journey';

/** Project form periods into the public contract without inventing dates for unfinished records. */
function period(item: ProfileExperience | ProfileProject) {
  return {
    startMonth: item.startMonth,
    endMonth: item.endMonth || null,
    endDay: item.endDay ? Number(item.endDay) : null,
    expected: item.expected,
  };
}

/** Adapt a read-only working copy to homepage DTOs without querying or persisting content.
 * Numeric IDs exist only in this view; normalized draft IDs and server references stay untouched.
 * Invalid dates/coordinates omit only the affected card/map stop and leave the editor recoverable.
 */
export function showcaseProjection(
  draft: ProfileDraft,
  locale: Locale,
  projectPage: number,
  size = 6,
) {
  const copy = draft.profiles[locale];
  const site: Site = {
    site_id: draft.source?.siteId ?? 1,
    user: draft.source?.user ?? 'preview',
    brand: draft.brand ?? { title: '', titleSub: '', copyrightYear: new Date().getUTCFullYear() },
    profile: {
      firstName: copy.firstName,
      familyName: copy.familyName,
      nickName: copy.nickName,
      introContent: copy.intro,
      content: copy.content,
      eduCode: copy.eduCode,
      program: copy.program,
      footerContent: copy.footer,
    },
    social: draft.social,
    chatme: {
      title: copy.chatTitle,
      titleSub: copy.chatSubtitle,
      content: copy.chatContent,
      icon: copy.chatIcon,
    },
  };
  const skills = (ids: string[]) =>
    ids.flatMap((id) => (draft.skills[id] ? [draft.skills[id]!.label] : []));
  let omitted = 0;
  const experiences = draft.experienceOrder.flatMap((id, index) => {
    const item = draft.experiences[id]!;
    if (!item.visible) return [];
    const text = item.translations[locale];
    const parsed = experienceSchema.safeParse({
      ...period(item),
      id: index + 1,
      order: index,
      type: item.type,
      countryCode: item.countryCode,
      countryName: text.country,
      city: text.city,
      organizationName: text.organization,
      organizationCode: text.organizationCode ?? '',
      organizationTitle: text.title,
      content: text.content,
      skills: skills(item.skillIds),
      detail: item.detail
        ? { ...item.detail, endMonth: item.detail.endMonth || null, content: text.detail }
        : null,
    });
    if (!parsed.success) {
      omitted++;
      return [];
    }
    return [{ source: item, entry: parsed.data }];
  });
  const journey = experiences
    .flatMap(({ source, entry }) => {
      const parsed = journeyItemSchema.safeParse({
        ...entry,
        expected: source.expected,
        latitude: source.latitude.trim() ? Number(source.latitude) : NaN,
        longitude: source.longitude.trim() ? Number(source.longitude) : NaN,
      });
      if (!parsed.success) {
        omitted++;
        return [];
      }
      return [parsed.data];
    })
    .sort((a, b) => a.startMonth.localeCompare(b.startMonth) || a.id - b.id);
  const projects = draft.projectOrder
    .slice((projectPage - 1) * size, projectPage * size)
    .flatMap((id, index) => {
      const item = draft.projects[id];
      if (!item?.visible) return [];
      const text = item.translations[locale];
      const career = item.experienceId
        ? draft.experiences[item.experienceId]?.translations[locale]
        : undefined;
      const parsed = projectSchema.safeParse({
        ...period(item),
        id: (projectPage - 1) * size + index + 1,
        projectName: text.name,
        projectTitle: text.title,
        intro: text.intro,
        organizationName: career?.organization ?? text.organization ?? '',
        organizationCode: career?.organizationCode ?? text.organizationCode ?? '',
        organizationTitle: career?.title ?? text.organizationTitle ?? '',
        skills: skills(item.skillIds),
        detail: {
          workflowDescription: text.workflow,
          flow: text.flow,
          technicalDescription: text.technical,
          contribution: text.contribution,
          outcome: text.outcome,
        },
      });
      if (!parsed.success) {
        omitted++;
        return [];
      }
      return [parsed.data];
    });
  const categories = draft.categoryOrder.flatMap((id) => {
    const item = draft.categories[id]!;
    return item.visible
      ? [
          {
            id,
            label: item.names[locale],
            items: item.skillIds.flatMap((key) =>
              draft.skills[key] ? [{ id: key, label: draft.skills[key]!.label }] : [],
            ),
          },
        ]
      : [];
  });
  return {
    site,
    experiences: experiences.map(({ entry }) => entry),
    journey,
    projects,
    categories,
    omitted,
  };
}
