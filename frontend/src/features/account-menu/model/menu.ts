import type { AuthUser } from '@/features/auth/session';
import { canManage, type ManagementPermissionResource } from '@/features/auth/permissions';
import type { IconName } from '@/shared/ui/Icon';

type MenuItem = {
  key: string;
  icon: IconName;
  resource?: ManagementPermissionResource;
  heartbeat?: boolean;
};

const preferences: MenuItem[] = [
  { key: 'theme', icon: 'palette' },
  { key: 'language', icon: 'translate' },
];
const management: MenuItem[] = [
  { key: 'platformManagement', icon: 'dashboard', resource: 'sites' },
  { key: 'platformMonitoring', icon: 'activity', resource: 'monitoring' },
  { key: 'roleManagement', icon: 'shieldLock', resource: 'roles' },
  { key: 'userManagement', icon: 'people', resource: 'users' },
];

/** Describe ordered presentation groups using server-issued account permissions.
 * @param account Restored identity or null for a guest; no session lookup happens here.
 * @returns Nonempty presentation groups; the component delegates authentication actions to the page.
 * User management intentionally follows is_manage_sites, matching the requested UI policy.
 * API authorization remains server-owned.
 */
export function accountMenuGroups(account: AuthUser | null): MenuItem[][] {
  if (!account) return [preferences, [{ key: 'signIn', icon: 'doorOpen', heartbeat: true }]];
  const groups: MenuItem[][] = [
    [{ key: 'profile', icon: 'personCircle' }],
    management.filter((item) => !item.resource || canManage(account, item.resource)),
    preferences,
    [{ key: 'signOut', icon: 'boxArrowRight' }],
  ];
  return groups.filter((group) => group.length > 0);
}
