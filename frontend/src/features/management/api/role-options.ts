import { z } from 'zod';
import { ApiError, requestJson } from '@/shared/api/http';
import { managementPageSchema } from '../schemas/management';

const schema = managementPageSchema(
  z.object({
    id: z.number().int().min(1).max(2147483647),
    role: z.string().min(1).max(64),
    is_active: z.boolean(),
    can_assign: z.boolean(),
  }),
);

/** User-scoped choices do not require Role-list permission. The write API rechecks grant limits.
 * @author ZhengLee 2026.10.16
 */
export async function loadUserRoleOptions(search: string, page: number, signal: AbortSignal) {
  const size = 30;
  const result = await requestJson(
    `management/users/role-options?${new URLSearchParams({ search, page: String(page), size: String(size) })}`,
    schema,
    { credentials: 'include', cache: 'no-store', signal },
  );
  if (result.page !== page || result.size !== size) throw new ApiError('contract');
  return result;
}
