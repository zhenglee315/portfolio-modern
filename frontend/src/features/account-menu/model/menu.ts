import type { AuthUser } from '@/features/auth/session';
import { canManage, type ManagementPermissionResource } from '@/features/auth/permissions';
import type { IconName } from '@/shared/ui/Icon';

type MenuItem = {
  key: string;
  label?: string;
  icon: IconName;
  heartbeat?: boolean;
  navigation?: Pick<ManagementNavigationItem, 'resource' | 'view'>;
};
type MenuGroup = {
  key: string;
  heading?: 'monitor' | 'management' | 'preferences';
  items: MenuItem[];
};

const preferences: MenuItem[] = [
  { key: 'theme', icon: 'palette' },
  { key: 'language', icon: 'translate' },
];
type ManagementNavigationItem = {
  id: string;
  label: string;
  shortLabel: string;
  icon: IconName;
  resource: ManagementPermissionResource;
  view?: 'requests' | 'workers';
  group: 'monitoring' | 'management';
};
/** One ordered navigation definition for Gear, settings sidebar and mobile drawer. */
export const managementNavigation: readonly ManagementNavigationItem[] = [
  {
    id: 'monitor-overview',
    label: 'overviewMonitoring',
    shortLabel: 'management.shortLabels.monitoring',
    icon: 'globe',
    resource: 'monitoring',
    group: 'monitoring',
  },
  {
    id: 'monitor-requests',
    label: 'platformMonitoring',
    shortLabel: 'monitor.requests',
    icon: 'activity',
    resource: 'monitoring',
    view: 'requests',
    group: 'monitoring',
  },
  {
    id: 'monitor-workers',
    label: 'workersMonitoring',
    shortLabel: 'monitor.workers',
    icon: 'cpu',
    resource: 'monitoring',
    view: 'workers',
    group: 'monitoring',
  },
  {
    id: 'sites',
    label: 'platformManagement',
    shortLabel: 'management.shortLabels.sites',
    icon: 'dashboard',
    resource: 'sites',
    group: 'management',
  },
  {
    id: 'roles',
    label: 'roleManagement',
    shortLabel: 'management.shortLabels.roles',
    icon: 'shieldLock',
    resource: 'roles',
    group: 'management',
  },
  {
    id: 'users',
    label: 'userManagement',
    shortLabel: 'management.shortLabels.users',
    icon: 'people',
    resource: 'users',
    group: 'management',
  },
];

/** Describe ordered presentation groups using server-issued account permissions.
 * @param account Restored identity or null for a guest; no session lookup happens here.
 * @returns Nonempty presentation groups; the component delegates authentication actions to the page.
 * Section captions replace repeated suffixes; API authorization remains server-owned.
 */
export function accountMenuGroups(account: AuthUser | null): MenuGroup[] {
  const preferenceGroup: MenuGroup = {
    key: 'preferences',
    heading: 'preferences',
    items: preferences,
  };
  if (!account)
    return [
      preferenceGroup,
      { key: 'authentication', items: [{ key: 'signIn', icon: 'doorOpen', heartbeat: true }] },
    ];
  const navigation = managementNavigation.filter((item) => canManage(account, item.resource));
  const groups: MenuGroup[] = [
    { key: 'account', items: [{ key: 'profile', icon: 'personCircle' }] },
    {
      key: 'monitoring',
      heading: 'monitor',
      items: navigation
        .filter((item) => item.group === 'monitoring')
        .map(({ label: key, icon, shortLabel: label, resource, view }) => ({
          key,
          icon,
          label,
          navigation: { resource, view },
        })),
    },
    {
      key: 'management',
      heading: 'management',
      items: navigation
        .filter((item) => item.group === 'management')
        .map(({ label: key, icon, shortLabel: label, resource, view }) => ({
          key,
          icon,
          label,
          navigation: { resource, view },
        })),
    },
    preferenceGroup,
    { key: 'authentication', items: [{ key: 'signOut', icon: 'boxArrowRight' }] },
  ];
  return groups.filter((group) => group.items.length > 0);
}
