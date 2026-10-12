import { expect, test, type Locator, type Page } from '@playwright/test';
import type { ManagementResource, ManagementRow } from '@/features/management';
import type { NumberedPage } from '@/shared/schemas/records';

test.skip(
  !process.env.PORTFOLIO_API_SMOKE_TARGET,
  'Explicit backend target required for read-only management integration.',
);

const activeFields = { roles: 'is_active', users: 'is_active', sites: 'owner_is_active' };
const activeLabels = { roles: 'Active', users: 'Active', sites: 'Owner active' };

/** Read the browser's actual proxy response; no endpoint or session response is replaced. */
async function readList(
  page: Page,
  resource: ManagementResource,
  action: () => Promise<unknown>,
  expected: Record<string, string>,
) {
  const response = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return (
      candidate.request().method() === 'GET' &&
      url.pathname === `/api/management/${resource}` &&
      Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value)
    );
  });
  await action();
  const received = await response;
  expect(received.status()).toBe(200);
  // The browser accepts these rows through production Zod schemas; live unit tests also
  // validate every field. Keep Node's test runner independent of browser translation imports.
  const result = (await received.json()) as NumberedPage<ManagementRow>;
  expect(result.pages).toBe(Math.ceil(result.total / result.size));
  if (expected.page) expect(result.page).toBe(Number(expected.page));
  if (expected.size) expect(result.size).toBe(Number(expected.size));
  return result;
}

/** Compare identities and cardinality with the accepted live page, never with seeded IDs. */
async function expectRows(management: Locator, result: NumberedPage<ManagementRow>) {
  await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  await expect(management.locator('tbody > tr')).toHaveCount(result.items.length);
  await expect
    .poll(() =>
      management
        .locator('tbody > tr')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-row-key'))),
    )
    .toEqual(result.items.map((row) => String(row.id)));
  await expect(management.locator('tbody > tr > td:first-child')).toHaveText(
    result.items.map((row) => String(row.id)),
  );
  const updatedIndex = (await management.locator('thead th').allTextContents()).findIndex((text) =>
    /^(?:Account updated|Updated)/.test(text),
  );
  expect(updatedIndex).toBeGreaterThan(0);
  for (const [index, row] of result.items.entries()) {
    await expect(management.locator('tbody > tr').nth(index)).toContainText(
      'user' in row ? row.user : row.role,
    );
    const updated = (row as Record<string, unknown>).updatetime;
    const time = management
      .locator('tbody > tr')
      .nth(index)
      .locator('td')
      .nth(updatedIndex)
      .locator('time');
    if (typeof updated === 'string') await expect(time).toHaveAttribute('datetime', updated);
    else await expect(time).toHaveCount(0);
  }
  await expect(management.getByRole('alert')).toHaveCount(0);
}

for (const resource of ['sites', 'users', 'roles'] as const) {
  test(`live ${resource} renders actual API rows and keeps controls on selected server pages`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const requests: URL[] = [];
    const mutations: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/management/')) {
        requests.push(url);
        if (request.method() !== 'GET') mutations.push(request.method());
      }
    });

    const first = await readList(page, resource, () => page.goto(`/en/management/${resource}`), {
      page: '1',
      size: '6',
      sort: 'id:desc',
    });
    const management = page.locator(`[data-management-resource="${resource}"]`);
    await expectRows(management, first);
    await expect(management.locator('thead th').nth(1).getByRole('button')).toHaveAccessibleName(
      resource === 'roles' ? 'Sort Role name ascending' : 'Sort Account ascending',
    );
    await expect(management.getByRole('columnheader').last()).toHaveText('Actions');
    await expect(management.locator('form').getByRole('combobox')).toHaveCount(0);
    await expect(management.locator('thead th').first().getByRole('button')).toHaveAccessibleName(
      'Remove sorting for ID',
    );
    await expect(
      management.locator('thead th').filter({ hasText: /^(?:Website ID|Role ID)/ }),
    ).toHaveCount(0);
    await expect(
      management.getByRole('button', { name: 'Clear sorting', exact: true }),
    ).toBeVisible();
    expect(requests).toHaveLength(1);
    if (resource === 'sites') expect(requests[0]!.searchParams.get('locale')).toBe('en');
    if (resource === 'sites') {
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.screenshot({
        path: testInfo.outputPath('management-live-sites.png'),
        fullPage: true,
      });
    }
    await expect(
      management.getByRole('button', { name: 'Previous page', exact: true }),
    ).toBeDisabled();
    // The first page remains useful when a development database contains fewer than six rows.
    const next = management.getByRole('button', { name: 'Next page', exact: true });
    if (first.pages > 1) {
      const second = await readList(page, resource, () => next.click(), { page: '2', size: '6' });
      await expectRows(management, second);
    } else await expect(next).toBeDisabled();

    if (first.total > 1) {
      const single = await readList(
        page,
        resource,
        () => page.goto(`/en/management/${resource}?page=1&size=1`),
        { page: '1', size: '1', sort: 'id:desc' },
      );
      await expectRows(management, single);
      const second = await readList(page, resource, () => next.click(), {
        page: '2',
        size: '1',
      });
      await expectRows(management, second);
      expect(second.items[0]!.id).toBeLessThan(single.items[0]!.id);
      const previous = await readList(
        page,
        resource,
        () =>
          management
            .getByRole('button', {
              name: 'Previous page',
              exact: true,
            })
            .click(),
        { page: '1', size: '1' },
      );
      await expectRows(management, previous);
      expect(previous.items.map((row) => row.id)).toEqual(single.items.map((row) => row.id));
    }

    const sized = await readList(
      page,
      resource,
      () =>
        management.getByRole('combobox', { name: 'Rows per page', exact: true }).selectOption('10'),
      { page: '1', size: '10' },
    );
    await expectRows(management, sized);
    expect(sized.total).toBe(first.total);

    const active = management.getByRole('button', {
      name: `Filter and sort ${activeLabels[resource]}`,
      exact: true,
    });
    const chooseActive = async (choice: 'All' | 'Yes' | 'No') => {
      await active.scrollIntoViewIfNeeded();
      await active.click();
      await page.getByRole('radio', { name: choice, exact: true }).check();
      await expect(active).toBeFocused();
    };
    const inactive = await readList(page, resource, () => chooseActive('No'), {
      page: '1',
      [activeFields[resource]]: 'false',
    });
    await expectRows(management, inactive);
    expect(
      inactive.items.every(
        (row) => (row as Record<string, unknown>)[activeFields[resource]] === false,
      ),
    ).toBe(true);
    const restored = await readList(page, resource, () => chooseActive('All'), { page: '1' });
    await expectRows(management, restored);

    const sorted = await readList(
      page,
      resource,
      () =>
        management
          .getByRole('button', {
            name: `Sort ${activeLabels[resource]} ascending`,
            exact: true,
          })
          .click(),
      { sort: `${activeFields[resource]}:asc` },
    );
    await expectRows(management, sorted);
    const priority = await readList(
      page,
      resource,
      () =>
        management
          .getByRole('button', {
            name: 'Sort ID ascending',
            exact: true,
          })
          .click({ modifiers: ['Shift'] }),
      { sort: `${activeFields[resource]}:asc,id:asc` },
    );
    await expectRows(management, priority);
    const ordered = priority.items as Record<string, unknown>[];
    for (let index = 1; index < ordered.length; index++) {
      const before = ordered[index - 1]!;
      const after = ordered[index]!;
      expect(Number(before[activeFields[resource]])).toBeLessThanOrEqual(
        Number(after[activeFields[resource]]),
      );
      if (before[activeFields[resource]] === after[activeFields[resource]])
        expect(before.id).toBeLessThan(after.id as number);
    }

    const representative = first.items[0];
    if (representative) {
      const name =
        resource === 'roles' && 'role' in representative
          ? representative.role
          : 'user' in representative
            ? representative.user
            : '';
      const term = name.split(/\s+/u)[0]!;
      const searched = await readList(
        page,
        resource,
        () =>
          management
            .getByRole('searchbox', {
              name: 'Search',
              exact: true,
            })
            .fill(term),
        { page: '1', search: term },
      );
      await expectRows(management, searched);
      expect(searched.total).toBeGreaterThan(0);
      if (searched.items.length) {
        await management.locator('tbody > tr').first().getByRole('button').click();
        const detail = page.getByRole('dialog');
        await expect(detail).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(detail).not.toBeVisible();
      }
    }
    expect(requests.every((url) => url.pathname === `/api/management/${resource}`)).toBe(true);
    expect(mutations).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`management-${resource}-live.png`),
      fullPage: true,
    });
  });
}
