import type { Locale } from '@/i18n/config';
import {
  createEmptyProfile,
  profileDraftSchema,
  type ProfileDraft,
  type ProfileExperience,
  type ProfileProject,
} from '@/features/profile-content';
import type { ProfileContentLocale } from './loadProfileContent';

const localized = <T>(copy: T): Record<Locale, T> => ({
  en: structuredClone(copy),
  'zh-Hant': structuredClone(copy),
  'zh-Hans': structuredClone(copy),
});
const experienceKey = (id: number) => `experience:${id}`;

/** Convert validated API snapshots once into an editable copy, preserving IDs, detail and languages.
 * The API has no project→career foreign key, so organization fields are retained without guessing a link.
 */
export function importProfileContent(snapshots: ProfileContentLocale[]): ProfileDraft {
  const draft = createEmptyProfile();
  const first = snapshots[0];
  if (!first) return draft;
  draft.source = {
    siteId: first.site.site_id,
    user: first.site.user,
    locales: snapshots.map((item) => item.locale),
  };
  draft.brand = first.site.brand;
  draft.social = first.site.social;
  const skillLabels = new Map<string, string>();
  // Resolve every catalog identity before attaching label-only experience/project skill arrays.
  for (const snapshot of snapshots) {
    const { locale, site } = snapshot;
    const source = site.profile;
    draft.profiles[locale] = {
      firstName: source.firstName,
      familyName: source.familyName,
      nickName: source.nickName,
      intro: source.introContent,
      content: source.content,
      eduCode: source.eduCode,
      program: source.program,
      footer: source.footerContent,
      chatTitle: site.chatme.title,
      chatSubtitle: site.chatme.titleSub,
      chatContent: site.chatme.content,
      chatIcon: site.chatme.icon,
    };
    for (const category of snapshot.categories) {
      const id = `category:${category.id}`;
      if (!draft.categories[id]) {
        draft.categoryOrder.push(id);
        draft.categories[id] = { id, names: localized(''), visible: true, skillIds: [] };
      }
      const target = draft.categories[id]!;
      target.names[locale] = category.label;
      for (const skill of snapshot.skills[category.id] ?? []) {
        const key = `skill:${skill.id}`;
        draft.skills[key] ??= { id: key, label: skill.label, labels: localized('') };
        draft.skills[key]!.labels![locale] = skill.label;
        if (!target.skillIds.includes(key)) target.skillIds.push(key);
        skillLabels.set(`${locale}:${skill.label}`, key);
        if (!skillLabels.has(skill.label)) skillLabels.set(skill.label, key);
      }
    }
  }
  const skillsFor = (locale: Locale, labels: string[]) => [
    ...new Set(
      labels.map((label) => {
        let key = skillLabels.get(`${locale}:${label}`) ?? skillLabels.get(label);
        if (!key) {
          key = `skill:unlisted:${Object.keys(draft.skills).length + 1}`;
          draft.skills[key] = { id: key, label, labels: localized(label) };
          skillLabels.set(label, key);
        }
        return key;
      }),
    ),
  ];
  for (const { locale, experiences, projects, journey } of snapshots) {
    const stops = new Map(journey.map((stop) => [stop.id, stop]));
    for (const item of experiences) {
      const id = experienceKey(item.id);
      if (!draft.experiences[id]) {
        const stop = stops.get(item.id);
        const entry: ProfileExperience = {
          id,
          type: item.type,
          visible: true,
          startMonth: item.startMonth,
          endMonth: item.endMonth ?? '',
          endDay: item.endDay?.toString() ?? '',
          expected: item.expected ?? false,
          countryCode: item.countryCode,
          latitude: stop?.latitude.toString() ?? '',
          longitude: stop?.longitude.toString() ?? '',
          detail: item.detail
            ? { startMonth: item.detail.startMonth, endMonth: item.detail.endMonth ?? '' }
            : null,
          skillIds: [],
          translations: localized({
            organization: '',
            organizationCode: '',
            title: '',
            city: '',
            country: '',
            content: '',
            detail: '',
          }),
        };
        draft.experienceOrder.push(id);
        draft.experiences[id] = entry;
      }
      const target = draft.experiences[id]!;
      target.skillIds = [...new Set([...target.skillIds, ...skillsFor(locale, item.skills)])];
      target.translations[locale] = {
        organization: item.organizationName,
        organizationCode: item.organizationCode,
        title: item.organizationTitle,
        city: item.city,
        country: item.countryName,
        content: item.content,
        detail: item.detail?.content ?? '',
      };
    }
    for (const item of projects) {
      const id = `project:${item.id}`;
      if (!draft.projects[id]) {
        const entry: ProfileProject = {
          id,
          experienceId: null,
          visible: true,
          startMonth: item.startMonth,
          endMonth: item.endMonth ?? '',
          endDay: item.endDay?.toString() ?? '',
          expected: item.expected ?? false,
          skillIds: [],
          translations: localized({
            name: '',
            organization: '',
            organizationCode: '',
            organizationTitle: '',
            title: '',
            intro: '',
            workflow: '',
            flow: [] as string[],
            technical: '',
            contribution: '',
            outcome: '',
          }),
        };
        draft.projectOrder.push(id);
        draft.projects[id] = entry;
      }
      const target = draft.projects[id]!;
      target.skillIds = [...new Set([...target.skillIds, ...skillsFor(locale, item.skills ?? [])])];
      target.translations[locale] = {
        name: item.projectName,
        title: item.projectTitle,
        organization: item.organizationName,
        organizationCode: item.organizationCode,
        organizationTitle: item.organizationTitle,
        intro: item.intro,
        workflow: item.detail?.workflowDescription ?? '',
        flow: item.detail?.flow ? [...item.detail.flow] : [],
        technical: item.detail?.technicalDescription ?? '',
        contribution: item.detail?.contribution ?? '',
        outcome: item.detail?.outcome ?? '',
      };
    }
  }
  return profileDraftSchema.parse(draft);
}
