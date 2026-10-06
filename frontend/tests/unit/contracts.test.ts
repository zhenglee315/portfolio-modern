import { describe, expect, it } from 'vitest';
import { siteSchema } from '@/features/site';
import { journeySchema } from '@/features/journey';
import { experiencesSchema } from '@/features/experiences';
import { projectsSchema } from '@/features/projects';
import { categoriesSchema, skillsSchema } from '@/features/skills';
import {
  careerFixture,
  experienceFixture,
  journeyFixture,
  pageFixture,
  projectFixture,
  siteFixture,
} from '../fixtures/portfolio';

describe('six endpoint contracts', () => {
  it('accepts direct objects and the single numbered contract', () => {
    expect(siteSchema.parse(siteFixture)).toEqual(siteFixture);
    expect(journeySchema.parse(journeyFixture)).toEqual(journeyFixture);
    expect(experiencesSchema.parse(pageFixture([experienceFixture])).total).toBe(1);
    expect(projectsSchema.parse(pageFixture([projectFixture])).pages).toBe(1);
    const skills = pageFixture([{ id: 'python', label: 'Python' }]);
    expect(skillsSchema.parse(skills).items).toHaveLength(1);
    expect(
      categoriesSchema.parse(pageFixture([{ id: 'apis', label: 'APIs', skills }])).items,
    ).toHaveLength(1);
  });
  it('accepts empty collections and out-of-range pages', () => {
    expect(journeySchema.parse([])).toEqual([]);
    expect(projectsSchema.parse(pageFixture([], 3)).page).toBe(3);
    expect(skillsSchema.parse(pageFixture([{ id: 'a', label: 'A' }], 2)).items).toEqual([]);
  });
  it('preserves nullable and omitted optional meanings', () => {
    const experience = { ...experienceFixture, expected: null };
    expect(experiencesSchema.parse(pageFixture([experience])).items[0]?.expected).toBeNull();
    expect(
      projectsSchema.parse(pageFixture([{ ...projectFixture, skills: null, detail: null }]))
        .items[0]?.skills,
    ).toBeNull();
  });
  it.each([
    { ...pageFixture([]), items: null },
    { ...pageFixture([projectFixture]), total: 8 },
    { ...pageFixture([projectFixture]), pages: 2 },
    { ...pageFixture([projectFixture]), size: 12 },
    pageFixture([projectFixture, projectFixture]),
  ])('rejects invalid page structure or repeated IDs', (value) => {
    expect(projectsSchema.safeParse(value).success).toBe(false);
  });
  it('rejects reverse dates, invalid leap days, unknown types and coordinates', () => {
    for (const changes of [
      { endMonth: '2023-12' },
      { endMonth: '2025-02', endDay: 29 },
      { type: 'other' },
      { latitude: 91 },
    ]) {
      expect(journeySchema.safeParse([{ ...journeyFixture[0], ...changes }]).success).toBe(false);
    }
    expect(
      journeySchema.safeParse([{ ...journeyFixture[0], endMonth: '2024-02', endDay: 29 }]).success,
    ).toBe(true);
    expect(
      experiencesSchema.safeParse(
        pageFixture([{ ...experienceFixture, ...careerFixture, endMonth: null, endDay: 1 }]),
      ).success,
    ).toBe(false);
  });
  it('rejects a category preview which is not the first page', () => {
    expect(
      categoriesSchema.safeParse(pageFixture([{ id: 'a', label: 'A', skills: pageFixture([], 2) }]))
        .success,
    ).toBe(false);
  });
  it('retains exact stable IDs and validates leap days in low ISO years', () => {
    expect(skillsSchema.safeParse(pageFixture([{ id: ' python ', label: 'Python' }])).success).toBe(
      false,
    );
    expect(
      journeySchema.safeParse([
        { ...journeyFixture[0], startMonth: '0000-01', endMonth: '0000-02', endDay: 29 },
      ]).success,
    ).toBe(true);
    expect(
      journeySchema.safeParse([
        { ...journeyFixture[0], startMonth: '0001-01', endMonth: '0001-02', endDay: 29 },
      ]).success,
    ).toBe(false);
  });
});
