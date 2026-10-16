import { z } from 'zod';
import { ApiError, requestJson } from '@/shared/api/http';
import { managementSiteSchema, type SiteRow } from '../schemas/management';

const id = z.number().int().min(1).max(2147483647);
const deletionSchema = z.strictObject({
  deleted_count: z.number().int().min(1).max(100),
  deleted: z
    .array(z.strictObject({ account_id: id, site_id: id }))
    .min(1)
    .max(100),
});

/** Confirm both owner and website identity; one batch request represents one transaction.
 * Never retry a destructive write, including a lost or invalid success response.
 * @author ZhengLee 2026.10.16
 */
export async function deleteManagementSites(rows: readonly SiteRow[]) {
  if (
    !rows.length ||
    rows.length > 100 ||
    rows.some(
      (row) => !managementSiteSchema.safeParse(row).success || !row.has_site || !row.site_id,
    ) ||
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    new Set(rows.map((row) => row.site_id)).size !== rows.length
  )
    throw new ApiError('contract');
  const targets = rows.map((row) => ({
    account_id: row.id,
    expected_owner_email: row.owner_email,
    expected_site_id: row.site_id!,
  }));
  const first = targets[0]!;
  const single = targets.length === 1;
  const result = await requestJson(
    single ? `management/sites/${first.account_id}` : 'management/sites/bulk-delete',
    deletionSchema,
    {
      method: single ? 'DELETE' : 'POST',
      credentials: 'include',
      cache: 'no-store',
      json: single
        ? {
            expected_owner_email: first.expected_owner_email,
            expected_site_id: first.expected_site_id,
          }
        : { targets },
    },
  );
  const confirmed = new Map(result.deleted.map((target) => [target.account_id, target.site_id]));
  if (
    result.deleted_count !== targets.length ||
    result.deleted.length !== targets.length ||
    confirmed.size !== targets.length ||
    targets.some((target) => confirmed.get(target.account_id) !== target.expected_site_id)
  )
    throw new ApiError('contract');
  return result;
}
