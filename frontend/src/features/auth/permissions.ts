import type { AuthUser } from './schemas/auth';

/** One UI policy follows the established server-issued management flags. */
export const managementPermissions = {
  sites: 'is_manage_sites',
  users: 'is_manage_sites',
  roles: 'is_manage_roles',
  monitoring: 'is_manage_sites',
} as const;

export type ManagementPermissionResource = keyof typeof managementPermissions;

/** Guests, missing identities and every value except an explicit true remain denied. */
export function canManage(
  account: AuthUser | null | undefined,
  resource: ManagementPermissionResource,
): boolean {
  return account?.[managementPermissions[resource]] === true;
}
