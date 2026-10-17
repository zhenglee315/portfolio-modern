import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { numberedPageSchema } from '@/shared/schemas/records';
import { managementPageSchema } from '@/features/management/schemas/management';

const item = z.object({ id: z.number().int().positive() });

describe.each([
  ['public', numberedPageSchema(item), 6],
  ['management', managementPageSchema(item), 2],
] as const)('%s page invariants', (_name, schema, size) => {
  const full = Array.from({ length: size }, (_, id) => ({ id: id + 1 }));
  it.each([
    { items: [], total: 0, pages: 0, page: 1, size },
    { items: full, total: size + 1, pages: 2, page: 1, size },
    { items: [{ id: 19 }], total: size + 1, pages: 2, page: 2, size },
    { items: [], total: size + 1, pages: 2, page: 3, size },
    { items: [], total: size, pages: 1, page: Number.MAX_SAFE_INTEGER, size },
  ])('accepts complete, empty and out-of-range pages: %j', (page) => {
    expect(schema.safeParse(page).success).toBe(true);
  });
  it.each([
    { items: full, total: size + 1, pages: 1, page: 1, size },
    { items: [], total: size, pages: 1, page: 1, size },
    { items: full.map(() => ({ id: 1 })), total: size, pages: 1, page: 1, size },
    { items: [{ id: 1 }], total: 0, pages: 0, page: 1, size },
    { items: [], total: 0, pages: 0, page: 0, size },
    { items: [], total: 0, pages: 0, page: 1, size: 0 },
  ])('rejects inconsistent arithmetic and identities: %j', (page) => {
    expect(schema.safeParse(page).success).toBe(false);
  });
});

it('retains the separate public and management page-size policies', () => {
  const page = { items: [], total: 0, pages: 0, page: 1, size: 100 };
  expect(numberedPageSchema(item).safeParse(page).success).toBe(false);
  expect(managementPageSchema(item).safeParse(page).success).toBe(true);
  expect(managementPageSchema(item).safeParse({ ...page, size: 101 }).success).toBe(false);
});
