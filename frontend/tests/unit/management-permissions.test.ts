import { describe, expect, it } from 'vitest';
import { canManage, managementPermissions } from '@/features/auth/permissions';
import type { AuthUser } from '@/features/auth/schemas/auth';
const flags = ['is_manage_sites', 'is_manage_users', 'is_manage_roles'] as const;
const resources = ['sites', 'users', 'roles'] as const;
const account: AuthUser = {
  id: 1,
  user: 'operator',
  email: 'operator@example.com',
  role: 'arbitrary-role-name',
  is_create: true,
  is_read: true,
  is_update: true,
  is_delete: true,
  is_manage_sites: false,
  is_manage_users: false,
  is_manage_roles: false,
};
describe('management module grants', () => {
  for (const resource of resources) {
    it(`${resource} denies missing identity`, () => {
      expect(canManage(null, resource)).toBe(false);
      expect(canManage(undefined, resource)).toBe(false);
    });
    for (const field of flags)
      it(`${resource} only accepts its own ${field} flag`, () => {
        expect(canManage({ ...account, [field]: true }, resource)).toBe(
          managementPermissions[resource] === field,
        );
      });
    it(`${resource} cannot use content CRUD or its role name as permission`, () => {
      expect(canManage({ ...account, role: 'admin' }, resource)).toBe(false);
    });
    it(`${resource} requires exactly boolean true`, () => {
      const field = managementPermissions[resource];
      for (const value of [1, 'true', null, undefined]) {
        expect(canManage({ ...account, [field]: value } as unknown as AuthUser, resource)).toBe(
          false,
        );
      }
    });
  }
});
