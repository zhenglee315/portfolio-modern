import type { IconName } from '@/shared/ui/Icon';

/** Single source for navigation labels, URL fragments, icon keys and old aliases. */
export const sections: { id: string; icon: IconName; label: string; aliases?: string[] }[] = [
  { id: 'overview', icon: 'home', label: 'ui.overview', aliases: ['intro'] },
  { id: 'journey', icon: 'airplane', label: 'ui.journey' },
  { id: 'experience', icon: 'briefcase', label: 'ui.experience' },
  { id: 'projects', icon: 'award', label: 'ui.projects' },
  { id: 'skills', icon: 'braces', label: 'ui.skills', aliases: ['stack', 'toolkit'] },
];

/** Decode canonical and legacy hashes without throwing on malformed fragments. */
export function resolveSection(hash: string) {
  try {
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    return sections.find((section) => section.id === id || section.aliases?.includes(id))?.id;
  } catch {
    return undefined;
  }
}
