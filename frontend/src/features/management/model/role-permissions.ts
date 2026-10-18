import { z } from 'zod';

/** Declare role permission groups once for row contracts, editors and column labels.
 * New permission fields must also be explicitly supported by backend/auth contracts.
 * Management flags cannot be granted to the registration Default role.
 * @author ZhengLee 2026.10.16
 */
export const rolePermissionDefinitions = {
  is_create: { label: 'Create', detail: 'Create', management: false },
  is_read: { label: 'Read', detail: 'Read', management: false },
  is_update: { label: 'Update', detail: 'Update', management: false },
  is_delete: { label: 'Delete', detail: 'Delete', management: false },
  is_monitor: { label: 'Monitor', detail: 'Monitor', management: false },
  is_manage_sites: { label: 'Site', detail: 'Manage Site', management: true },
  is_manage_users: { label: 'Users', detail: 'Manage Users', management: true },
  is_manage_roles: { label: 'Roles', detail: 'Manage Roles', management: true },
} as const;

export type RolePermissionField = keyof typeof rolePermissionDefinitions;
export const rolePermissionFields = Object.keys(
  rolePermissionDefinitions,
) as readonly RolePermissionField[];
export const rolePermissionSchema = z.object(
  Object.fromEntries(rolePermissionFields.map((field) => [field, z.boolean()])) as Record<
    RolePermissionField,
    z.ZodBoolean
  >,
);

/** Use declared group membership rather than field-name prefixes when checking Default eligibility. */
export function hasRoleManagementPermission(role: Record<RolePermissionField, boolean>) {
  return rolePermissionFields.some(
    (field) => rolePermissionDefinitions[field].management && role[field],
  );
}
