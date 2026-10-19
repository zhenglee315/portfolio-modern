import type { ProfileDraft } from './profile';

/** New/unpublished owners start empty; design examples never stand in for their API content. */
export function createEmptyProfile(): ProfileDraft {
  const profile = {
    firstName: '',
    familyName: '',
    nickName: '',
    intro: '',
    content: '',
    eduCode: '',
    program: '',
    footer: '',
    chatTitle: '',
    chatSubtitle: '',
    chatContent: '',
    chatIcon: 'chat' as const,
  };
  return {
    version: 1,
    profiles: { en: { ...profile }, 'zh-Hant': { ...profile }, 'zh-Hans': { ...profile } },
    social: { linkedin: '', github: '', medium: '', email: '' },
    experienceOrder: [],
    experiences: {},
    projectOrder: [],
    projects: {},
    categoryOrder: [],
    categories: {},
    skills: {},
  };
}
