import { createProfileExample } from '../../src/features/profile-content/model/seed';
import type { Locale } from '../../src/i18n/config';
import { pageFixture } from './portfolio';

/** Synthetic design review content now crosses the real API adapter, exclusively in browser tests. */
export function profileSourceFixture(url: URL) {
  const resource = url.pathname.split('/').at(-1);
  if (
    resource === 'site'
      ? url.searchParams.get('user') !== 'operator'
      : url.searchParams.get('site_id') !== '91'
  )
    return undefined;
  const draft = createProfileExample();
  const locale = (url.searchParams.get('locale') ?? 'en') as Locale;
  const profile = draft.profiles[locale];
  const page = Number(url.searchParams.get('page') ?? 1);
  const careers = draft.experienceOrder.map((key, index) => {
    const entry = draft.experiences[key]!;
    const copy = entry.translations[locale];
    return {
      id: index + 1,
      type: entry.type,
      countryCode: entry.countryCode,
      countryName: copy.country,
      city: copy.city,
      organizationName: copy.organization,
      organizationCode: key,
      organizationTitle: copy.title,
      startMonth: entry.startMonth,
      endMonth: entry.endMonth || null,
      endDay: entry.endDay ? Number(entry.endDay) : null,
      expected: entry.expected,
      detail: entry.detail
        ? {
            startMonth: entry.detail.startMonth,
            endMonth: entry.detail.endMonth || null,
            content: copy.detail,
          }
        : null,
      latitude: Number(entry.latitude),
      longitude: Number(entry.longitude),
      content: copy.content,
      skills: entry.skillIds.map((id) => draft.skills[id]!.label),
      order: draft.experienceOrder.length - index,
    };
  });
  switch (resource) {
    case 'site':
      return {
        site_id: 91,
        user: 'operator',
        brand: { title: 'ZL', titleSub: 'WILSON', copyrightYear: 2026 },
        profile: {
          firstName: profile.firstName,
          familyName: profile.familyName,
          nickName: profile.nickName,
          content: profile.content,
          eduCode: profile.eduCode,
          program: profile.program,
          introContent: profile.intro,
          footerContent: profile.footer,
        },
        social: draft.social,
        chatme: {
          title: profile.chatTitle,
          titleSub: profile.chatSubtitle,
          content: profile.chatContent,
          icon: profile.chatIcon,
        },
      };
    case 'journey':
      return [...careers].sort((a, b) => a.startMonth.localeCompare(b.startMonth));
    case 'experiences':
      return pageFixture(careers, page);
    case 'projects':
      return pageFixture(
        draft.projectOrder.map((id, index) => {
          const entry = draft.projects[id]!;
          const copy = entry.translations[locale];
          const career = entry.experienceId ? draft.experiences[entry.experienceId] : undefined;
          return {
            id: index + 1,
            organizationName: career?.translations[locale].organization ?? '',
            organizationCode: entry.experienceId ?? '',
            organizationTitle: career?.translations[locale].title ?? '',
            startMonth: entry.startMonth,
            endMonth: entry.endMonth || null,
            expected: entry.expected,
            projectName: copy.name,
            projectTitle: copy.title,
            intro: copy.intro,
            detail: {
              workflowDescription: copy.workflow,
              flow: copy.flow,
              technicalDescription: copy.technical,
              contribution: copy.contribution,
              outcome: copy.outcome,
            },
            skills: entry.skillIds.map((id) => draft.skills[id]!.label),
          };
        }),
        page,
      );
    case 'skill-categories':
      return pageFixture(
        draft.categoryOrder.map((id) => ({
          id,
          label: draft.categories[id]!.names[locale],
          skills: pageFixture(draft.categories[id]!.skillIds.map((id) => draft.skills[id]!)),
        })),
        page,
      );
    case 'skills':
      return pageFixture(
        (draft.categories[url.searchParams.get('ownerId') ?? '']?.skillIds ?? []).map(
          (id) => draft.skills[id]!,
        ),
        page,
      );
    default:
      return undefined;
  }
}
