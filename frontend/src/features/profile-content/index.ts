export { useProfileDraft, profileDraftKey } from './hooks/useProfileDraft';
export { createProfileExample } from './model/seed';
export { createEmptyProfile } from './model/empty';
export {
  profileDraftSchema,
  profileDraftIssues,
  isProfileMonth,
  profileJourney,
  moveProfileItem,
  removeProfileExperience,
  removeProfileExperiences,
  newProfileExperience,
  newProfileProject,
  newProfileId,
} from './model/profile';
export type {
  ProfileDraft,
  ProfileExperience,
  ProfileProject,
  ProfileIntroduction,
  ProfileCategory,
  ProfileSection,
  DraftIssue,
} from './model/profile';

export { readProfileContent, saveProfileContent } from './api/profile';
export { readProfileProjectPage } from './api/profile';
export {
  mergeProfileProjectPages,
  removeProfileProjects,
  profileProjectReferences,
} from './model/projects';
export type { ProfileProjectPage } from './model/projects';
