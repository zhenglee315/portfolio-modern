import { describe, expect, it } from 'vitest';
import { supportedLocales } from '@/i18n/config';
import {
  createProfileExample,
  moveProfileItem,
  newProfileExperience,
  newProfileProject,
  profileDraftIssues,
  profileDraftSchema,
  profileJourney,
  removeProfileExperience,
  removeProfileExperiences,
} from '@/features/profile-content';

describe('normalized profile content', () => {
  it('keeps incomplete skill names editable but blocks empty and duplicate names on save', () => {
    const draft = createProfileExample();
    const [first, second] = Object.values(draft.skills);
    first!.label = ' ';
    expect(profileDraftSchema.safeParse(draft).success).toBe(true);
    expect(profileDraftIssues(draft, 'en')).toContainEqual({
      field: `skills.${first!.id}`,
      reason: 'required',
    });
    first!.label = ` ${second!.label.toUpperCase()} `;
    expect(profileDraftIssues(draft, 'en')).toEqual(
      expect.arrayContaining([
        { field: `skills.${first!.id}`, reason: 'duplicate' },
        { field: `skills.${second!.id}`, reason: 'duplicate' },
      ]),
    );
    first!.label = 'A distinct name';
    expect(profileDraftIssues(draft, 'en')).toEqual([]);
  });
  it.each([
    ['a', 'c', 'before', ['b', 'a', 'c', 'd']],
    ['a', 'c', 'after', ['b', 'c', 'a', 'd']],
    ['d', 'b', 'before', ['a', 'd', 'b', 'c']],
    ['d', 'b', 'after', ['a', 'b', 'd', 'c']],
  ] as const)('places %s %s at its %s insertion edge', (source, target, placement, expected) => {
    const order = ['a', 'b', 'c', 'd'];
    expect(moveProfileItem(order, source, target, placement)).toEqual(expected);
    expect(order).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves cancelled, invalid and unchanged drop positions untouched', () => {
    const order = ['a', 'b', 'c'];
    expect(moveProfileItem(order, 'a', 'a', 'after')).toBe(order);
    expect(moveProfileItem(order, 'missing', 'b', 'before')).toBe(order);
    expect(moveProfileItem(order, 'a', 'b', 'before')).toBe(order);
    expect(moveProfileItem(order, 'b', 'a', 'after')).toBe(order);
  });
  it('provides complete, independent example drafts for all content languages', () => {
    const draft = createProfileExample();
    expect(profileDraftSchema.safeParse(draft).success).toBe(true);
    for (const locale of supportedLocales) expect(profileDraftIssues(draft, locale)).toEqual([]);
    draft.profiles.en.firstName = 'Changed';
    expect(draft.profiles['zh-Hant'].firstName).not.toBe('Changed');
    expect(createProfileExample().profiles.en.firstName).not.toBe('Changed');
  });

  it('keeps manual card order independent of Journey chronology and shares career records', () => {
    const draft = createProfileExample();
    const chronology = profileJourney(draft).map((entry) => entry.id);
    draft.experienceOrder = moveProfileItem(
      draft.experienceOrder,
      'delta',
      draft.experienceOrder[0]!,
    );
    expect(draft.experienceOrder[0]).toBe('delta');
    expect(profileJourney(draft).map((entry) => entry.id)).toEqual(chronology);
    draft.experiences.delta!.translations.en.city = 'Changed city';
    expect(profileJourney(draft).find((entry) => entry.id === 'delta')?.translations.en.city).toBe(
      'Changed city',
    );
    draft.experiences.delta!.visible = false;
    expect(profileJourney(draft).some((entry) => entry.id === 'delta')).toBe(false);
  });

  it('clears project relationships when a career is removed while retaining shared content', () => {
    const draft = createProfileExample();
    const next = removeProfileExperience(draft, 'delta');
    expect(next.experiences.delta).toBeUndefined();
    expect(next.experienceOrder).not.toContain('delta');
    expect(next.projectOrder).toEqual(draft.projectOrder);
    expect(Object.values(next.projects).every((project) => project.experienceId !== 'delta')).toBe(
      true,
    );
    expect(next.skills).toBe(draft.skills);
    expect(draft.experiences.delta).toBeDefined();
    expect(profileDraftSchema.safeParse(next).success).toBe(true);
  });

  it('removes multiple careers through one path while retaining every project and shared skill', () => {
    const draft = createProfileExample();
    const ids = draft.experienceOrder.slice(0, 2);
    const next = removeProfileExperiences(draft, ids);
    expect(next.experienceOrder).toEqual(draft.experienceOrder.slice(2));
    expect(next.projectOrder).toEqual(draft.projectOrder);
    expect(next.skills).toBe(draft.skills);
    expect(
      Object.values(next.projects).every((project) => !ids.includes(project.experienceId ?? '')),
    ).toBe(true);
    expect(draft.experienceOrder).toHaveLength(next.experienceOrder.length + 2);
    expect(removeProfileExperiences(draft, ['missing'])).toBe(draft);
    expect(profileDraftSchema.safeParse(next).success).toBe(true);
  });

  it.each(['order', 'skill-reference', 'career-reference', 'skill-id'])(
    'rejects damaged %s references before loading storage',
    (kind) => {
      const draft = createProfileExample();
      if (kind === 'order') draft.experienceOrder.push('delta');
      if (kind === 'skill-reference') draft.experiences.delta!.skillIds.push('missing');
      if (kind === 'career-reference') Object.values(draft.projects)[0]!.experienceId = 'missing';
      if (kind === 'skill-id') Object.values(draft.skills)[0]!.id = 'wrong-id';
      expect(profileDraftSchema.safeParse(draft).success).toBe(false);
    },
  );

  it('validates calendar dates, coordinates and contact links without rejecting other languages', () => {
    const draft = createProfileExample();
    const entry = draft.experiences.delta!;
    entry.startMonth = '2024-03';
    entry.endMonth = '2024-02';
    entry.endDay = '30';
    entry.latitude = '91';
    entry.longitude = 'NaN';
    entry.translations['zh-Hant'].organization = '';
    draft.social.github = 'javascript:alert(1)';
    draft.social.email = 'not-an-email';
    expect(profileDraftIssues(draft, 'en')).toEqual(
      expect.arrayContaining([
        { field: 'experiences.delta.endMonth', reason: 'period' },
        { field: 'experiences.delta.endDay', reason: 'day' },
        { field: 'experiences.delta.latitude', reason: 'coordinate' },
        { field: 'experiences.delta.longitude', reason: 'coordinate' },
        { field: 'social.github', reason: 'url' },
        { field: 'social.email', reason: 'email' },
      ]),
    );
    expect(profileDraftIssues(draft, 'en').some((issue) => issue.reason === 'required')).toBe(
      false,
    );
    expect(profileDraftIssues(draft, 'zh-Hant')).toContainEqual({
      field: 'experiences.delta.organization',
      reason: 'required',
    });
    entry.startMonth = '2024-01';
    entry.endDay = '29';
    expect(profileDraftIssues(draft, 'en').some((issue) => issue.reason === 'day')).toBe(false);
    entry.startMonth = '2024-13';
    expect(profileDraftIssues(draft, 'en')).toContainEqual({
      field: 'experiences.delta.startMonth',
      reason: 'date',
    });
  });

  it('creates empty translations and workflow arrays without aliasing', () => {
    const career = newProfileExperience();
    const project = newProfileProject(career.id);
    career.translations.en.title = 'English title';
    project.translations.en.flow.push('English step');
    expect(career.translations['zh-Hant'].title).toBe('');
    expect(project.translations['zh-Hans'].flow).toEqual([]);
    expect(project.experienceId).toBe(career.id);
    expect(newProfileExperience().id).not.toBe(career.id);
  });
});
