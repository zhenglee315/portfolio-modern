import type { AuthUser } from '@/features/auth/session';
import { canManage, type ManagementPermissionResource } from '@/features/auth/permissions';
import type { IconName } from '@/shared/ui/Icon';

type MenuItem = {
  key: string;
  icon: IconName;
  heartbeat?: boolean;
};

const preferences: MenuItem[] = [
  { key: 'theme', icon: 'palette' },
  { key: 'language', icon: 'translate' },
];
/** One ordered navigation definition for Gear, settings sidebar and mobile drawer. */
export const managementNavigation = [
  { label: 'platformMonitoring', icon: 'activity', resource: 'monitoring', group: 'monitoring' },
  { label: 'platformManagement', icon: 'dashboard', resource: 'sites', group: 'management' },
  { label: 'roleManagement', icon: 'shieldLock', resource: 'roles', group: 'management' },
  { label: 'userManagement', icon: 'people', resource: 'users', group: 'management' },
] as const satisfies readonly {
  label: string;
  icon: IconName;
  resource: ManagementPermissionResource;
  group: 'monitoring' | 'management';
}[];

/** Describe ordered presentation groups using server-issued account permissions.
 * @param account Restored identity or null for a guest; no session lookup happens here.
 * @returns Nonempty presentation groups; the component delegates authentication actions to the page.
 * User management intentionally follows is_manage_sites, matching the requested UI policy.
 * API authorization remains server-owned.
 */
export function accountMenuGroups(account: AuthUser | null): MenuItem[][] {
  if (!account) return [preferences, [{ key: 'signIn', icon: 'doorOpen', heartbeat: true }]];
  const navigation = managementNavigation.filter((item) => canManage(account, item.resource));
  const groups: MenuItem[][] = [
    [{ key: 'profile', icon: 'personCircle' }],
    navigation
      .filter((item) => item.group === 'monitoring')
      .map(({ label: key, icon }) => ({ key, icon })),
    navigation
      .filter((item) => item.group === 'management')
      .map(({ label: key, icon }) => ({ key, icon })),
    preferences,
    [{ key: 'signOut', icon: 'boxArrowRight' }],
  ];
  return groups.filter((group) => group.length > 0);
}
