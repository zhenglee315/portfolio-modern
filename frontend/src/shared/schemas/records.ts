import { z } from 'zod';

export const recordIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const stableIdSchema = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => value.trim() === value && value.trim().length > 0);
export const textSchema = z.string();
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const pageSize = 6;

/** Describe a backend page without duplicating its records in application state. */
export type NumberedPage<T> = {
  items: T[];
  total: number;
  pages: number;
  page: number;
  size: number;
};

/** Validate calendar relationships, including nullable days and ongoing periods.
 * @param value Declared calendar fields from the owning domain DTO.
 * @param context Zod refinement context receiving contract violations.
 */
export function validatePeriod(
  value: { startMonth: string; endMonth: string | null; endDay?: number | null },
  context: z.RefinementCtx,
) {
  if (value.endMonth && value.endMonth < value.startMonth) {
    context.addIssue({
      code: 'custom',
      message: 'Period ends before it starts.',
      path: ['endMonth'],
    });
  }
  if (value.endDay != null) {
    const [year, month] = (value.endMonth ?? '').split('-').map(Number);
    // setUTCFullYear preserves ISO years 0000–0099 rather than remapping them into 1900.
    const end = new Date(0);
    end.setUTCFullYear(year ?? 0, month ?? 0, 0);
    const maximum = year !== undefined && month !== undefined ? end.getUTCDate() : 0;
    if (!value.endMonth || value.endDay > maximum) {
      context.addIssue({
        code: 'custom',
        message: 'Day does not belong to the end month.',
        path: ['endDay'],
      });
    }
  }
}

export const periodShape = {
  startMonth: monthSchema,
  endMonth: monthSchema.nullable(),
  endDay: z.number().int().min(1).max(31).nullish(),
};

/** Reject repeated stable identities before a response enters the query cache. */
export function uniqueRecords<T extends { id: string | number }>(
  items: T[],
  context: z.RefinementCtx,
) {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    context.addIssue({ code: 'custom', message: 'Duplicate record identity.' });
  }
}

/** Specialize the shared five-field backend contract for a domain item schema.
 * @param item Domain schema, validated before page arithmetic and unique IDs.
 * @returns A schema accepting valid empty and out-of-range pages, never null items.
 */
export function numberedPageSchema<T extends z.ZodType<{ id: string | number }>>(item: T) {
  return z
    .object({
      items: z.array(item),
      total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      pages: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      page: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      size: z.literal(pageSize),
    })
    .superRefine((value, context) => {
      const expected =
        value.page > value.pages
          ? 0
          : Math.min(value.size, value.total - (value.page - 1) * value.size);
      if (value.pages !== Math.ceil(value.total / value.size) || value.items.length !== expected) {
        context.addIssue({ code: 'custom', message: 'Page arithmetic is inconsistent.' });
      }
      uniqueRecords(value.items, context);
    });
}
