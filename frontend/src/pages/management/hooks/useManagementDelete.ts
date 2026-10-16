import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  deleteManagementRecords,
  type ManagementResource,
  type ManagementRow,
} from '@/features/management';
import { refreshAuthSession } from '@/features/auth/session';
import { ApiError } from '@/shared/api/http';
import { notificationFailure } from '@/i18n/notification-copy';
import { useNotifications } from '@/shared/ui/NotificationProvider';

const rejectionCopy: Record<string, string> = {
  MANAGEMENT_DELETE_COMMITTED_CACHE_UNAVAILABLE: 'committed',
  DEFAULT_SITE_DELETE_FORBIDDEN: 'default',
  SITE_DELETE_CONFLICT: 'conflict',
  USER_DELETE_CONFLICT: 'conflict',
  ROLE_DELETE_CONFLICT: 'conflict',
  SITE_NOT_FOUND: 'missing',
  ACCOUNT_NOT_FOUND: 'missing',
  ROLE_NOT_FOUND: 'missing',
  DEFAULT_ROLE_REQUIRED: 'defaultRole',
  ROLE_IN_USE: 'roleInUse',
  LAST_ROLE_MANAGER_REQUIRED: 'lastManager',
};

/** Coordinate one irreversible write and reconcile every outcome with authoritative lists.
 * Shared dialogs only display state; they never choose targets or call management APIs.
 * @author ZhengLee 2026.10.16
 */
export function useManagementDelete(
  resource: ManagementResource,
  accountId: number | undefined,
  enabled: boolean,
) {
  const client = useQueryClient(),
    { t } = useTranslation(),
    { notify } = useNotifications();
  const locked = useRef(false);
  const [working, setWorking] = useState(false);
  const mutation = useMutation({
    mutationKey: ['management-delete', accountId, resource],
    retry: false,
    networkMode: 'always',
    meta: { private: true },
    mutationFn: (rows: readonly ManagementRow[]) => deleteManagementRecords(resource, rows),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ['management', accountId] });
    },
  });
  const remove = async (rows: readonly ManagementRow[]) => {
    if (!enabled || !accountId || locked.current) return;
    locked.current = true;
    setWorking(true);
    try {
      await mutation.mutateAsync(rows);
      const copy =
        resource === 'sites' ? 'deletion' : resource === 'roles' ? 'roleDeletion' : 'userDeletion';
      notify({ kind: 'success', message: t(`management.${copy}.saved`, { count: rows.length }) });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;
      const committed = code === 'MANAGEMENT_DELETE_COMMITTED_CACHE_UNAVAILABLE';
      const reason =
        code && rejectionCopy[code]
          ? rejectionCopy[code]
          : error instanceof ApiError && error.kind === 'http' && (error.status ?? 0) < 500
            ? 'failed'
            : 'uncertain';
      notify({
        kind: committed ? 'warning' : notificationFailure(error).kind,
        message: t(`management.deletion.${reason}`),
      });
    } finally {
      // A lost response may already be committed; refetch rather than retrying or hiding the owner row.
      await refreshAuthSession(client, new AbortController().signal).catch(() => undefined);
      await Promise.allSettled([
        client.invalidateQueries({ queryKey: ['management', accountId] }),
        client.invalidateQueries({ queryKey: ['portfolio'] }),
      ]);
      locked.current = false;
      setWorking(false);
    }
  };
  return { remove, busy: working || mutation.isPending };
}
