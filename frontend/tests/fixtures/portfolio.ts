import type { Locale } from '@/i18n/config';

/** Synthetic public fixtures used by contracts and browser fault injection.
 * They deliberately contain no captured API responses or personal configuration.
 */
export const siteFixture = {
  brand: { title: 'Demo', titleSub: 'Engineer', copyrightYear: 2026 },
  profile: {
    firstName: 'Alex',
    familyName: 'Example',
    nickName: 'Alex',
    content: 'Build useful systems.',
    eduCode: 'UNI',
    program: 'Computer science',
    introContent: 'Software engineer',
    footerContent: 'Keep building.',
  },
  social: {
    linkedin: '',
    github: 'https://github.com/example',
    medium: '',
    email: 'hello@example.com',
  },
  chatme: {
    title: 'Hello',
    titleSub: 'Get in touch',
    content: 'Send an email.',
    icon: 'assets/cow-engineer.svg',
  },
};
export const careerFixture = {
  id: 1,
  type: 'work' as const,
  countryCode: 'GBR',
  countryName: 'United Kingdom',
  city: 'London',
  organizationName: 'Example Studio',
  organizationCode: 'EX',
  organizationTitle: 'Engineer',
  startMonth: '2024-01',
  endMonth: '2024-12',
  endDay: null,
  expected: false,
  detail: null,
};
export const journeyFixture = [
  { ...careerFixture, latitude: 51.5, longitude: -0.1 },
  {
    ...careerFixture,
    id: 2,
    city: 'Bengaluru',
    countryCode: 'IND',
    countryName: 'India',
    latitude: 12.97,
    longitude: 77.59,
    startMonth: '2024-06',
    endMonth: '2024-10',
    // One valid long entry exercises popup scrolling through both SSG and dev first reads.
    detail: {
      startMonth: '2024-06',
      endMonth: '2024-10',
      endDay: null,
      content: 'A long but valid career detail. '.repeat(100),
    },
  },
  {
    ...careerFixture,
    id: 3,
    city: 'Taipei',
    countryCode: 'TWN',
    countryName: 'Taiwan',
    latitude: 25.03,
    longitude: 121.56,
    type: 'education' as const,
    startMonth: '2025-01',
    endMonth: null,
  },
];
export const experienceFixture = {
  ...careerFixture,
  order: 1,
  content: 'Delivered systems.',
  skills: ['TypeScript', 'Python'],
};
export const projectFixture = {
  id: 1,
  organizationName: 'Example Studio',
  organizationCode: 'EX',
  organizationTitle: 'Engineer',
  startMonth: '2024-01',
  endMonth: '2024-03',
  expected: false,
  projectName: 'Example project',
  projectTitle: 'Web application',
  intro: 'An accessible application.',
  detail: {
    workflowDescription: 'Design and deliver.',
    flow: ['Design', 'Build', 'Review'],
    technicalDescription: 'Typed boundaries.',
    contribution: 'Implemented features.',
    outcome: 'Reliable delivery.',
  },
  skills: ['TypeScript'],
};

/** Build a valid numbered response from an ordered, synthetic collection. */
export function pageFixture<T>(items: T[], page = 1) {
  return {
    items: items.slice((page - 1) * 6, page * 6),
    total: items.length,
    pages: Math.ceil(items.length / 6),
    page,
    size: 6 as const,
  };
}

/** Assign distinct descending months so static and live fixtures share timeline selection scope. */
function timelineMonth(index: number) {
  return new Date(Date.UTC(2024, 11 - index, 1)).toISOString().slice(0, 7);
}

/** Resolve all six endpoint fixtures while honoring page, owner, and locale. */
export function endpointFixture(url: URL) {
  const locale = (url.searchParams.get('locale') ?? 'en') as Locale;
  const page = Number(url.searchParams.get('page') ?? 1);
  const skills = Array.from({ length: 14 }, (_, i) => ({
    id: `skill-${i}`,
    label: `${locale} Skill ${i + 1}`,
  }));
  switch (url.pathname.replace(/^\/api/, '')) {
    case '/system/heartbeat':
      return { online: 3 };
    case '/portfolio/site':
      return siteFixture;
    case '/portfolio/journey':
      return journeyFixture;
    case '/portfolio/experiences':
      return pageFixture(
        Array.from({ length: 8 }, (_, i) => ({
          ...experienceFixture,
          id: i + 1,
          startMonth: timelineMonth(i),
          endMonth: timelineMonth(i),
        })),
        page,
      );
    case '/portfolio/projects':
      return pageFixture(
        Array.from({ length: 15 }, (_, i) => ({
          ...projectFixture,
          id: i + 1,
          startMonth: timelineMonth(i),
          endMonth: timelineMonth(i),
          projectName: `${locale} Project ${i + 1}`,
        })),
        page,
      );
    case '/portfolio/skill-categories':
      return pageFixture(
        Array.from({ length: 7 }, (_, i) => ({
          id: `category-${i}`,
          label: `${locale} Category ${i + 1}`,
          skills: pageFixture(skills),
        })),
        page,
      );
    case '/portfolio/skills':
      return pageFixture(skills, page);
    default:
      return undefined;
  }
}
