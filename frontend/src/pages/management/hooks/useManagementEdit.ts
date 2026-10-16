import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { dataTableEditCopy } from '@/i18n/table-copy';
import { notificationFailure } from '@/i18n/notification-copy';
import {
  updateManagementRecord,
  rolePermissionDefinitions,
  rolePermissionFields,
  hasRoleManagementPermission,
  loadUserRoleOptions,
  type EditableManagementResource,
  type ManagementRow,
} from '@/features/management';
import { refreshAuthSession } from '@/features/auth/session';
import { ApiError } from '@/shared/api/http';
import { useDataTableEditGroup } from '@/shared/hooks/useDataTableEditGroup';
import type {
  DataTableEditField,
  DataTableEditGroup,
  DataTableEditValues,
} from '@/shared/lib/data-table-edit';
import { useNotifications } from '@/shared/ui/NotificationProvider';
import type { InlineFieldEditor } from '@/shared/ui/InlineField';
import type { SelectSource } from '@/shared/ui/SearchableSelect';

/** Own one write coordinator for both the table and details; shared editors remain API-independent.
 * Every outcome reconciles authoritative data, including committed/uncertain failures.
 * @author ZhengLee 2026.10.16
 */
export function useManagementEdit(
  resource: EditableManagementResource,
  locale: Locale,
  accountId: number | undefined,
  enabled: boolean,
) {
  const client = useQueryClient();
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const roleSource = useMemo<SelectSource>(
    () => ({
      load: async (search, page, signal) => {
        const result = await loadUserRoleOptions(search, page, signal);
        return {
          ...result,
          items: result.items.map((role) => ({
            value: role.id,
            label: role.role,
            disabled: !role.can_assign,
            reason: role.can_assign
              ? undefined
              : t(`management.roleAssignment.${role.is_active ? 'forbidden' : 'inactive'}`),
          })),
        };
      },
    }),
    [t],
  );
  const roleEditor = (row: ManagementRow): InlineFieldEditor => ({
    type: 'searchable-select',
    validate: (value) => typeof value === 'number' && Number.isInteger(value) && value > 0,
    selection: {
      source: roleSource,
      colored: true,
      selected: 'login_count' in row ? { value: row.role_id, label: row.role } : undefined,
      copy: {
        search: t('management.filter.search'),
        empty: t('management.filter.noOptions'),
        loading: t('ui.loading'),
        error: t('management.loadError'),
        retry: t('ui.retry'),
        more: t('management.filter.more'),
      },
    },
  });
  const locked = useRef(false);
  const [working, setWorking] = useState(false);
  const mutation = useMutation({
    mutationKey: ['management-update', accountId, resource],
    retry: false,
    networkMode: 'always',
    meta: { private: true },
    mutationFn: ({ row, changes }: { row: ManagementRow; changes: Record<string, unknown> }) =>
      updateManagementRecord(resource, row, changes, locale),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ['management', accountId] });
    },
  });
  const { mutateAsync, isPending } = mutation;
  const save = useCallback(
    async (row: ManagementRow, changes: Record<string, unknown>) => {
      if (!enabled || !accountId || locked.current) throw new ApiError('contract');
      locked.current = true;
      setWorking(true);
      try {
        await mutateAsync({ row, changes });
        notify({ kind: 'success', message: t('management.quick.saved') });
      } catch (error) {
        const committed =
          error instanceof ApiError &&
          error.code === 'MANAGEMENT_UPDATE_COMMITTED_CACHE_UNAVAILABLE';
        const uncertain =
          !(error instanceof ApiError) || error.kind !== 'http' || (error.status ?? 0) >= 500;
        const code = error instanceof ApiError ? error.code : undefined;
        const rules: Record<string, string> = {
          MANAGEMENT_EDIT_CONFLICT: 'conflict',
          DEFAULT_ROLE_REQUIRED: 'defaultRoleRequired',
          DEFAULT_ROLE_REQUIRES_ACTIVE_UNPRIVILEGED: 'defaultRoleEligible',
          LAST_ROLE_MANAGER_REQUIRED: 'lastManager',
          DEFAULT_SITE_REQUIRES_ACTIVE_PUBLISHED: 'siteEligible',
          MANAGEMENT_UPDATE_CONFLICT: 'unique',
          ROLE_ASSIGNMENT_FORBIDDEN: 'roleAssignmentForbidden',
          ROLE_ASSIGNMENT_INACTIVE: 'roleAssignmentInactive',
        };
        notify({
          kind: committed ? 'warning' : notificationFailure(error).kind,
          message: t(
            committed
              ? 'management.quick.committed'
              : code && rules[code]
                ? `management.write.${rules[code]}`
                : uncertain
                  ? 'management.quick.uncertain'
                  : 'management.quick.failed',
          ),
        });
        throw error;
      } finally {
        // Storage success stays success even when a subsequent identity/list refresh is unavailable.
        await refreshAuthSession(client, new AbortController().signal).catch(() => undefined);
        await Promise.allSettled([
          client.invalidateQueries({ queryKey: ['management', accountId] }),
          client.invalidateQueries({ queryKey: ['portfolio'] }),
        ]);
        locked.current = false;
        setWorking(false);
      }
    },
    [enabled, accountId, mutateAsync, notify, t, client],
  );
  const group: DataTableEditGroup<ManagementRow, DataTableEditValues> = {
    fields:
      resource === 'sites'
        ? {
            owner_is_active: { editor: { type: 'boolean' }, required: true },
            is_default: {
              editor: (_v, row) => ({
                type: 'boolean',
                nullable: 'has_site' in row && !row.has_site,
              }),
              dependsOn: ['owner_is_active'],
              clearValue: (v, row) =>
                'owner_is_active' in row && row.has_site
                  ? v.owner_is_active === false
                    ? false
                    : row.is_default
                  : null,
              canEdit: (v, row) =>
                'owner_is_active' in row &&
                row.has_site &&
                (v.is_default === true ||
                  (v.owner_is_active === true && row.is_published === true)),
              unavailableReason: (v, row) =>
                'owner_is_active' in row &&
                (v.is_default === true ||
                  (row.has_site && v.owner_is_active === true && row.is_published === true))
                  ? undefined
                  : t('management.defaultRequires'),
            },
          }
        : resource === 'roles'
          ? {
              ...Object.fromEntries(
                rolePermissionFields.map((field) => [
                  field,
                  {
                    editor: { type: 'boolean' },
                    required: true,
                    canEdit: (_values, row) =>
                      'user_count' in row &&
                      !(row.is_default && rolePermissionDefinitions[field].management),
                    unavailableReason: (_values, row) =>
                      'user_count' in row &&
                      row.is_default &&
                      rolePermissionDefinitions[field].management
                        ? t('management.write.defaultRoleEligible')
                        : undefined,
                  } satisfies DataTableEditField<ManagementRow, DataTableEditValues>,
                ]),
              ),
              is_active: {
                editor: { type: 'boolean' },
                required: true,
                canEdit: (_v, row) => 'user_count' in row && !row.is_default,
                unavailableReason: (_v, row) =>
                  'user_count' in row && row.is_default
                    ? t('management.write.defaultRoleRequired')
                    : undefined,
              },
              is_default: {
                editor: { type: 'boolean' },
                required: true,
                canEdit: (_v, row) =>
                  'user_count' in row &&
                  !row.is_default &&
                  row.is_active &&
                  !hasRoleManagementPermission(row),
                unavailableReason: (_v, row) =>
                  'user_count' in row
                    ? row.is_default
                      ? t('management.write.defaultRoleRequired')
                      : !row.is_active || hasRoleManagementPermission(row)
                        ? t('management.write.defaultRoleEligible')
                        : undefined
                    : undefined,
              },
            }
          : {
              is_active: { editor: { type: 'boolean' }, required: true },
              role_id: { editor: (_values, row) => roleEditor(row), required: true },
            },
    read: (row): DataTableEditValues | null => {
      if (resource === 'sites' && 'owner_is_active' in row)
        return { owner_is_active: row.owner_is_active, is_default: row.is_default };
      if (resource === 'roles' && 'user_count' in row)
        return {
          ...Object.fromEntries(rolePermissionFields.map((field) => [field, row[field]])),
          is_active: row.is_active,
          is_default: row.is_default,
        };
      if (resource === 'users' && 'login_count' in row)
        return { is_active: row.is_active, role_id: row.role_id };
      return null;
    },
    failure: 'discard',
    save: ({ row, changes }) => save(row, changes),
    display: (row, values, pending) =>
      pending?.changes.is_default === true &&
      pending.row.id !== row.id &&
      values.is_default !== null
        ? { ...values, is_default: false }
        : { ...values },
  };
  const editor = useDataTableEditGroup({
    scope: `${accountId}/${resource}/${locale}`,
    group,
    rowKey: (r) => r.id,
    enabled: enabled && !!accountId && !isPending && !working,
    copy: dataTableEditCopy(t),
  });
  return {
    roleEditor,
    save,
    busy: working || isPending || editor.busy,
    columns: Object.fromEntries(
      Object.keys(group.fields).map((field) => [field, editor.column(field)]),
    ),
  };
}
