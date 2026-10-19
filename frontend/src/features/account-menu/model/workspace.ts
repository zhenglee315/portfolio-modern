import type { Locale } from '@/i18n/config';
import type { TFunction } from 'i18next';
import type { AuthUser } from '@/features/auth/session';
import { canManage } from '@/features/auth/permissions';
import type { SidebarNavigationItem } from '@/shared/ui/SidebarNavigation';
import { managementNavigation } from './menu';

/** Personal editing and administrative routes share one ordered, permission-filtered navigation. */
export const profileSections = [
  { id: 'overview', icon: 'personCircle' },
  { id: 'experience', icon: 'briefcase' },
  { id: 'projects', icon: 'award' },
  { id: 'skills', icon: 'braces' },
] as const;
type ProfileSection = (typeof profileSections)[number]['id'];

/** Section links retain content language/paging and leave the current entity editor. */
export function profileSectionParams(
  current: URLSearchParams,
  section: ProfileSection,
  edit?: string,
) {
  const next = new URLSearchParams(current);
  next.set('section', section);
  if (edit) next.set('edit', edit);
  else next.delete('edit');
  return next;
}

/** Keep local Profile callbacks and route links distinct; only monitor-to-monitor links retain filters. */
export function workspaceNavigation({
  account,
  locale,
  t,
  profile,
  monitorSearch,
  onClose,
}: {
  account: AuthUser;
  locale: Locale;
  t: TFunction;
  profile?: { params: URLSearchParams; onSelect: (section: ProfileSection) => void };
  monitorSearch?: string;
  onClose: () => void;
}): SidebarNavigationItem[] {
  return [
    ...profileSections.map((item) => ({
      ...item,
      label: t(`management.profile.${item.id}`),
      group: t('accountMenu.profile'),
      // Same-page section changes keep the mounted working copy and its fade/focus lifecycle.
      ...(profile
        ? { href: `/${locale}/profile?${profileSectionParams(profile.params, item.id)}` }
        : { to: `/${locale}/profile?${profileSectionParams(new URLSearchParams(), item.id)}` }),
      onSelect: () => {
        onClose();
        profile?.onSelect(item.id);
      },
    })),
    ...managementNavigation
      .filter((item) => canManage(account, item.resource))
      .map((item) => {
        const query = new URLSearchParams(monitorSearch);
        if (item.view) query.set('monitorView', item.view);
        else query.delete('monitorView');
        return {
          id: item.id,
          label: t(item.shortLabel),
          group: t(`management.groups.${item.group}`),
          icon: item.icon,
          to: `/${locale}/management/${item.resource}${item.resource === 'monitoring' && query.size ? `?${query}` : ''}`,
          onSelect: onClose,
        };
      }),
  ];
}
