import { z } from 'zod';
import { localeSchema, type Locale } from '@/i18n/locales';

const text = z.string().max(100000);
const id = z.string().min(1).max(160);
const ids = z.array(id).max(500);
const localized = <T extends z.ZodType>(schema: T) => z.record(localeSchema, schema);
const period = { startMonth: text, endMonth: text, endDay: text, expected: z.boolean() };

/** Local drafts deliberately permit incomplete inputs; save-time validation is separate. */
const experienceSchema = z.object({
  id,
  type: z.enum(['work', 'education']),
  visible: z.boolean(),
  ...period,
  countryCode: text,
  latitude: text,
  longitude: text,
  detail: z.object({ startMonth: text, endMonth: text }).nullable(),
  skillIds: ids,
  translations: localized(
    z.object({
      organization: text,
      organizationCode: text.optional(),
      title: text,
      city: text,
      country: text,
      content: text,
      detail: text,
    }),
  ),
});
const projectSchema = z.object({
  id,
  experienceId: id.nullable(),
  visible: z.boolean(),
  ...period,
  skillIds: ids,
  translations: localized(
    z.object({
      name: text,
      organization: text.optional(),
      organizationCode: text.optional(),
      organizationTitle: text.optional(),
      title: text,
      intro: text,
      workflow: text,
      flow: z.array(text).max(30),
      technical: text,
      contribution: text,
      outcome: text,
    }),
  ),
});
const profileSchema = z.object({
  firstName: text,
  familyName: text,
  nickName: text,
  intro: text,
  content: text,
  eduCode: text,
  program: text,
  footer: text,
  chatTitle: text,
  chatSubtitle: text,
  chatContent: text,
  chatIcon: text,
});

/** One entity per ID: Journey references experiences; projects and categories reference skills. */
export const profileDraftSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative().optional(),
    source: z
      .object({ siteId: z.number().int().positive(), user: text, locales: z.array(localeSchema) })
      .optional(),
    brand: z.object({ title: text, titleSub: text, copyrightYear: z.number().int() }).optional(),
    profiles: localized(profileSchema),
    social: z.object({ linkedin: text, github: text, medium: text, email: text }),
    experienceOrder: ids,
    experiences: z.record(id, experienceSchema),
    projectOrder: ids,
    projects: z.record(id, projectSchema),
    categoryOrder: ids,
    categories: z.record(
      id,
      z.object({ id, names: localized(text), visible: z.boolean(), skillIds: ids }),
    ),
    skills: z.record(id, z.object({ id, label: text, labels: localized(text).optional() })),
  })
  .superRefine((draft, context) => {
    // Reject broken references from stale/corrupted storage before rendering any editor.
    const error = () => context.addIssue({ code: 'custom', message: 'Invalid draft references.' });
    for (const [order, entities] of [
      [draft.experienceOrder, draft.experiences],
      [draft.projectOrder, draft.projects],
      [draft.categoryOrder, draft.categories],
    ] as const) {
      if (new Set(order).size !== order.length || order.length !== Object.keys(entities).length)
        error();
      for (const key of order) if (entities[key]?.id !== key) error();
    }
    for (const entity of [
      ...Object.values(draft.experiences),
      ...Object.values(draft.projects),
      ...Object.values(draft.categories),
    ]) {
      if (
        new Set(entity.skillIds).size !== entity.skillIds.length ||
        entity.skillIds.some((key) => !draft.skills[key])
      )
        error();
    }
    for (const project of Object.values(draft.projects)) {
      if (project.experienceId && !draft.experiences[project.experienceId]) error();
    }
    for (const [key, skill] of Object.entries(draft.skills)) if (skill.id !== key) error();
  });

export type ProfileDraft = z.infer<typeof profileDraftSchema>;
export type ProfileExperience = z.infer<typeof experienceSchema>;
export type ProfileProject = z.infer<typeof projectSchema>;
export type ProfileIntroduction = z.infer<typeof profileSchema>;
export type ProfileCategory = ProfileDraft['categories'][string];
export type ProfileSection = 'overview' | 'experience' | 'projects' | 'skills';
export type DraftIssue = {
  field: string;
  reason: 'required' | 'date' | 'period' | 'day' | 'coordinate' | 'url' | 'email';
};

/** Native month inputs and stored drafts share the same calendar-month policy. */
export function isProfileMonth(value: string) {
  return /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Reorder IDs without mutating entity records; keyboard controls and drag/drop share this path. */
export function moveProfileItem(
  order: string[],
  source: string,
  target: string,
  placement?: 'before' | 'after',
) {
  const from = order.indexOf(source),
    to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  // Pointer drops specify an insertion edge; existing step controls keep their original index policy.
  const destination = placement ? next.indexOf(target) + Number(placement === 'after') : to;
  next.splice(destination, 0, source);
  return next.every((key, index) => key === order[index]) ? order : next;
}

/** Removing a career keeps its projects and skills, clearing only the obsolete relationship. */
export function removeProfileExperience(draft: ProfileDraft, key: string): ProfileDraft {
  const experiences = { ...draft.experiences };
  delete experiences[key];
  return {
    ...draft,
    experiences,
    experienceOrder: draft.experienceOrder.filter((id) => id !== key),
    projects: Object.fromEntries(
      Object.entries(draft.projects).map(([id, project]) => [
        id,
        project.experienceId === key ? { ...project, experienceId: null } : project,
      ]),
    ),
  };
}

/** Save validation uses the active content language, preserving unfinished translations elsewhere. */
export function profileDraftIssues(draft: ProfileDraft, locale: Locale): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const required = (field: string, value: string) => {
    if (!value.trim()) issues.push({ field, reason: 'required' });
  };
  const validatePeriod = (
    field: string,
    value: Pick<ProfileExperience, 'startMonth' | 'endMonth' | 'endDay' | 'expected'>,
  ) => {
    required(`${field}.startMonth`, value.startMonth);
    for (const key of ['startMonth', 'endMonth'] as const)
      if (value[key] && !isProfileMonth(value[key]))
        issues.push({ field: `${field}.${key}`, reason: 'date' });
    if (value.endMonth && value.startMonth > value.endMonth)
      issues.push({ field: `${field}.endMonth`, reason: 'period' });
    if (value.expected && !value.endMonth) required(`${field}.endMonth`, value.endMonth);
    if (value.endDay) {
      const [year, month] = value.endMonth.split('-').map(Number);
      const days = year && month ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
      if (
        !/^\d{1,2}$/.test(value.endDay) ||
        Number(value.endDay) < 1 ||
        Number(value.endDay) > days
      )
        issues.push({ field: `${field}.endDay`, reason: 'day' });
    }
  };
  required('profile.firstName', draft.profiles[locale].firstName);
  required('profile.content', draft.profiles[locale].content);
  for (const key of draft.experienceOrder) {
    const entry = draft.experiences[key]!;
    const prefix = `experiences.${key}`;
    for (const field of ['organization', 'title', 'city', 'country', 'content'] as const)
      required(`${prefix}.${field}`, entry.translations[locale][field]);
    required(`${prefix}.latitude`, entry.latitude);
    required(`${prefix}.longitude`, entry.longitude);
    required(`${prefix}.countryCode`, entry.countryCode);
    validatePeriod(prefix, entry);
    if (entry.detail)
      validatePeriod(`${prefix}.detail`, { ...entry.detail, endDay: '', expected: false });
    for (const [field, limit] of [
      ['latitude', 90],
      ['longitude', 180],
    ] as const) {
      if (
        entry[field].trim() &&
        (!Number.isFinite(Number(entry[field])) || Math.abs(Number(entry[field])) > limit)
      )
        issues.push({ field: `${prefix}.${field}`, reason: 'coordinate' });
    }
  }
  for (const key of draft.projectOrder) {
    const project = draft.projects[key]!;
    required(`projects.${key}.name`, project.translations[locale].name);
    required(`projects.${key}.intro`, project.translations[locale].intro);
    validatePeriod(`projects.${key}`, project);
  }
  for (const category of Object.values(draft.categories))
    required(`categories.${category.id}`, category.names[locale]);
  for (const [key, value] of Object.entries(draft.social)) {
    if (!value.trim()) continue;
    if (key === 'email') {
      if (!/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(value))
        issues.push({ field: `social.${key}`, reason: 'email' });
    } else {
      try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
          throw new Error();
      } catch {
        issues.push({ field: `social.${key}`, reason: 'url' });
      }
    }
  }
  return issues;
}

/** Chronology comes from shared career dates, never the manually sorted Experience list. */
export function profileJourney(draft: ProfileDraft) {
  return Object.values(draft.experiences)
    .filter((entry) => entry.visible)
    .sort((a, b) => a.startMonth.localeCompare(b.startMonth) || a.id.localeCompare(b.id));
}

/** Stable IDs are generated only from user events; server rendering never generates draft IDs. */
export function newProfileId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

/** Empty translations stay independent, so editing one language cannot overwrite another. */
export function newProfileExperience(): ProfileExperience {
  const copy = { organization: '', title: '', city: '', country: '', content: '', detail: '' };
  return {
    id: newProfileId('experience'),
    type: 'work',
    visible: true,
    startMonth: '',
    endMonth: '',
    endDay: '',
    expected: false,
    countryCode: '',
    latitude: '',
    longitude: '',
    detail: null,
    skillIds: [],
    translations: { en: { ...copy }, 'zh-Hant': { ...copy }, 'zh-Hans': { ...copy } },
  };
}

export function newProfileProject(experienceId: string | null): ProfileProject {
  const copy = {
    name: '',
    title: '',
    intro: '',
    workflow: '',
    flow: [],
    technical: '',
    contribution: '',
    outcome: '',
  };
  return {
    id: newProfileId('project'),
    experienceId,
    visible: true,
    startMonth: '',
    endMonth: '',
    endDay: '',
    expected: false,
    skillIds: [],
    translations: {
      en: { ...copy, flow: [] },
      'zh-Hant': { ...copy, flow: [] },
      'zh-Hans': { ...copy, flow: [] },
    },
  };
}
