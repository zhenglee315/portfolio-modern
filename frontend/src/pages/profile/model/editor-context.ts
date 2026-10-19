import { createContext, useContext } from 'react';
import type { Locale } from '@/i18n/config';
import type { DraftIssue, ProfileDraft, ProfileSection } from '@/features/profile-content';

/** Page-scoped composition contract: views edit normalized data without owning persistence. */
export type ProfileEditorState = {
  draft: ProfileDraft;
  contentLocale: Locale;
  uiLocale: Locale;
  section: ProfileSection;
  dirty: boolean;
  hasSaved: boolean;
  busy: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  issues: DraftIssue[];
  update: (updater: (draft: ProfileDraft) => ProfileDraft) => void;
  save: () => void;
  cancel: () => void;
  openExperience: (id?: string) => void;
  openProject: (id?: string) => void;
  openSection: (section: ProfileSection) => void;
  confirm: (action: () => void, kind?: 'delete' | 'discard' | 'import') => void;
};
export const ProfileEditorContext = createContext<ProfileEditorState | null>(null);

/** Fail near the missing provider rather than rendering a partly disconnected form. */
export function useProfileEditor() {
  const context = useContext(ProfileEditorContext);
  if (!context) throw new Error('Profile editor provider is required.');
  return context;
}
