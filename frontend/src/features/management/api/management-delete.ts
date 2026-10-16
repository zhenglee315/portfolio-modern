import { z } from 'zod';
import { ApiError, requestJson } from '@/shared/api/http';
import {
  managementRoleSchema,
  managementUserSchema,
  managementSiteSchema,
  type ManagementResource,
  type ManagementRow,
} from '../schemas/management';
import { deleteManagementSites } from './site-delete';

const id = z.number().int().min(1).max(2147483647);
const roleReceipt = z.strictObject({
  deleted_count: id.max(100),
  deleted: z
    .array(z.strictObject({ role_id: id }))
    .min(1)
    .max(100),
});
const userReceipt = z.strictObject({
  deleted_count: id.max(100),
  deleted: z
    .array(z.strictObject({ account_id: id, site_id: id.nullable() }))
    .min(1)
    .max(100),
});
type Receipt = {
  deleted_count: number;
  deleted: ({ role_id: number } | { account_id: number; site_id: number | null })[];
};
type DeleteTarget =
  | { role_id: number; expected_role: string }
  | { account_id: number; expected_email: string; expected_site_id: number | null };

/** Share bounded single/batch transport and strict deletion receipts across management resources.
 * Identity snapshots confirm targets; only the server's current permission gates authorize deletion.
 * A lost or invalid response is never retried automatically.
 * @author ZhengLee 2026.10.16
 */
export async function deleteManagementRecords(
  resource: ManagementResource,
  rows: readonly ManagementRow[],
) {
  if (!rows.length || rows.length > 100 || new Set(rows.map((row) => row.id)).size !== rows.length)
    throw new ApiError('contract');
  if (resource === 'sites')
    return deleteManagementSites(
      rows.map((row) => {
        const parsed = managementSiteSchema.safeParse(row);
        if (!parsed.success) throw new ApiError('contract');
        return parsed.data;
      }),
    );
  const targets = rows.map((row): DeleteTarget => {
    if (resource === 'roles') {
      const parsed = managementRoleSchema.safeParse(row);
      if (!parsed.success) throw new ApiError('contract');
      return { role_id: parsed.data.id, expected_role: parsed.data.role };
    }
    const parsed = managementUserSchema.safeParse(row);
    if (!parsed.success) throw new ApiError('contract');
    return {
      account_id: parsed.data.id,
      expected_email: parsed.data.email,
      expected_site_id: parsed.data.site_id,
    };
  });
  const first = targets[0]!,
    single = targets.length === 1;
  const key = 'role_id' in first ? first.role_id : first.account_id;
  const confirmation =
    'role_id' in first
      ? { expected_role: first.expected_role }
      : { expected_email: first.expected_email, expected_site_id: first.expected_site_id };
  const result = await requestJson<Receipt>(
    single ? `management/${resource}/${key}` : `management/${resource}/bulk-delete`,
    resource === 'roles' ? roleReceipt : userReceipt,
    {
      method: single ? 'DELETE' : 'POST',
      credentials: 'include',
      cache: 'no-store',
      json: single ? confirmation : { targets },
    },
  );
  const confirmed = new Map(
    result.deleted.map((target) =>
      'role_id' in target ? [target.role_id, null] : [target.account_id, target.site_id],
    ),
  );
  if (
    result.deleted_count !== rows.length ||
    result.deleted.length !== rows.length ||
    confirmed.size !== rows.length ||
    targets.some((target) =>
      'role_id' in target
        ? !confirmed.has(target.role_id)
        : confirmed.get(target.account_id) !== target.expected_site_id,
    )
  )
    throw new ApiError('contract');
  return result;
}
