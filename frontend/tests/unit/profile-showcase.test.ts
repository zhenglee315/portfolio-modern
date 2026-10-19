import { describe, expect, it } from 'vitest';
import { showcaseProjection } from '@/pages/profile/model/showcase';
import { ownerProfileSnapshot } from '../fixtures/profile-owner';

describe('read-only homepage draft projection', () => {
  it('projects unsaved localized copy, shared references and visibility without mutating the draft', () => {
    const draft = ownerProfileSnapshot('alex');
    draft.profiles.en.firstName = 'Unsaved Ada';
    const career = draft.experiences[draft.experienceOrder[0]!]!;
    career.translations.en.organization = 'Draft employer';
    const project = draft.projects[draft.projectOrder[0]!]!;
    project.experienceId = career.id;
    project.translations.en.name = 'Unsaved project';
    draft.projects[draft.projectOrder[1]!]!.visible = false;
    const before = structuredClone(draft);
    const view = showcaseProjection(draft, 'en', 1);
    expect(view.site.profile.firstName).toBe('Unsaved Ada');
    expect(view.projects[0]?.projectName).toBe('Unsaved project');
    expect(view.projects[0]?.organizationName).toBe('Draft employer');
    expect(view.projects).toHaveLength(5);
    expect(view.projects[0]?.skills).toEqual(project.skillIds.map((id) => draft.skills[id]!.label));
    expect(draft).toEqual(before);
    expect(showcaseProjection(draft, 'zh-Hant', 1).site.profile.firstName).toBe(
      draft.profiles['zh-Hant'].firstName,
    );
  });

  it('omits only unfinished cards and map positions while retaining unloaded project scope', () => {
    const draft = ownerProfileSnapshot('alex');
    const first = draft.experiences[draft.experienceOrder[0]!]!;
    first.visible = true;
    first.latitude = '';
    const project = draft.projects[draft.projectOrder[0]!]!;
    project.startMonth = '';
    const view = showcaseProjection(draft, 'en', 1);
    expect(view.omitted).toBeGreaterThan(0);
    expect(
      view.experiences.some(
        (entry) => entry.organizationName === first.translations.en.organization,
      ),
    ).toBe(true);
    expect(view.journey.some((entry) => entry.id === 1)).toBe(false);
    expect(view.projects).toHaveLength(5);
    const incomplete = {
      ...draft,
      projects: { [draft.projectOrder[6]!]: draft.projects[draft.projectOrder[6]!]! },
    };
    expect(showcaseProjection(incomplete, 'en', 2).projects).toHaveLength(1);
    expect(incomplete.projectOrder).toHaveLength(15);
  });
});
