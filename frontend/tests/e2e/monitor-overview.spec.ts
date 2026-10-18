import { expect, test, type Page } from '@playwright/test';
import { monitorEndpointFixture } from '../fixtures/monitor';
import { installMonitorSocket } from '../fixtures/monitor-browser';
import { localDate, shiftDate } from '../../src/features/monitoring/overview-model';

const period = 'start=2026-10-09&end=2026-10-15';
const administrator = {
  id: 91,
  user: 'operator',
  email: 'operator@example.test',
  role: 'administrator',
  is_create: true,
  is_read: true,
  is_update: true,
  is_delete: true,
  is_manage_roles: true,
  is_manage_users: true,
  is_manage_sites: true,
};

async function openOverview(
  page: Page,
  options: {
    locale?: string;
    path?: string;
    override?: (path: string, body: unknown) => unknown;
    deny?: () => boolean;
    theme?: 'mint' | 'blue' | 'amber' | 'mist';
  } = {},
) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((theme) => {
    localStorage.setItem(
      'portfolio-appearance',
      JSON.stringify({ theme, speed: 1, brightness: 80, paused: false }),
    );
  }, options.theme ?? 'blue');
  const requests: URL[] = [];
  await page.route('**/api/authority/session', (route) => route.fulfill({ json: administrator }));
  await page.route('**/api/monitor/**', (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace('/api/monitor/', '/monitor/');
    requests.push(url);
    if (options.deny?.() && url.pathname === '/monitor/traffic')
      return route.fulfill({ status: 403, json: { detail: 'PERMISSION_DENIED' } });
    const body = monitorEndpointFixture(url);
    return route.fulfill({ json: options.override ? options.override(url.pathname, body) : body });
  });
  const subscriptions = await installMonitorSocket(page);
  await page.goto(`/${options.locale ?? 'en'}/management/monitoring?${options.path ?? period}`);
  await expect(page.locator('[data-monitor-overview]')).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'HTTP requests', exact: true })
      .or(page.getByRole('region', { name: 'HTTP 請求次數', exact: true }))
      .or(page.getByRole('region', { name: 'HTTP 请求次数', exact: true })),
  ).toContainText('10,840');
  return { requests, subscriptions, errors };
}

for (const theme of ['mint', 'blue', 'amber', 'mist'] as const) {
  test(`monitor content retains the original shell, navigation and motion in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openOverview(page, { theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const rail = page.locator('[data-sidebar-rail]');
    await expect(rail.locator('[data-nav-brand]')).toHaveText('PORTFOLIO');
    await expect(rail.locator('[data-sidebar-links]').first().getByRole('link')).toHaveText([
      'Overview',
      'Requests',
      'Workers',
      'Platform',
      'Roles',
      'Users',
    ]);
    const originalNavigation = () =>
      rail.evaluate((element) => {
        const styles = getComputedStyle(element);
        const item = element.querySelector('[data-sidebar-item]')!;
        const itemStyles = getComputedStyle(item);
        return {
          width: styles.width,
          padding: styles.padding,
          background: styles.backgroundColor,
          rowHeight: item.getBoundingClientRect().height,
          radius: itemStyles.borderRadius,
          font: itemStyles.fontFamily,
        };
      });
    await expect(page.locator('[data-entering]')).toHaveCount(0);
    const monitoringNavigation = await originalNavigation();
    expect(
      await page
        .locator('[data-monitor-workspace]')
        .evaluate((element) =>
          ['--bg', '--panel', '--accent', '--text', '--mono'].every(
            (name) =>
              getComputedStyle(element).getPropertyValue(name) ===
              getComputedStyle(document.documentElement).getPropertyValue(name),
          ),
        ),
    ).toBe(true);
    await expect(page.locator('[data-background-field]')).toHaveCount(1);
    await expect(page.locator('[data-field-edge]')).toHaveCount(4);
    await expect(page.locator('[data-signals-ready="true"] svg path').first()).toBeAttached();
    await page.mouse.move(1100, 180);
    await expect(page.locator('[data-pointer-glow]')).toHaveAttribute('data-visible', 'true');
    await expect(page.locator('#management-content[data-entrance-content]')).toBeVisible();
    await page.goto('/en/management/sites');
    await expect(page.locator('tbody tr')).toHaveCount(6);
    await expect(page.locator('[data-entering]')).toHaveCount(0);
    expect(await originalNavigation()).toEqual(monitoringNavigation);
  });
}

for (const viewport of [
  { width: 1512, height: 772 },
  { width: 1440, height: 780 },
]) {
  test(`four workers fit ${viewport.width}×${viewport.height} without page or table scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const state = await openOverview(page);
    await page.getByRole('link', { name: 'Workers', exact: true }).click();
    const table = page.getByRole('table', { name: 'Uvicorn worker status', exact: true });
    await expect(
      page.getByRole('region', { name: 'Successful requests', exact: true }),
    ).toContainText('1,000');
    await expect(page.getByRole('region', { name: 'Failed requests', exact: true })).toContainText(
      '40',
    );
    await expect(table.getByRole('columnheader', { name: 'Requests', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Failed', exact: true })).toBeVisible();
    await expect(table.locator('tbody tr').first()).toContainText('260');
    await expect(table.locator('tbody tr')).toHaveCount(4);
    await expect(table.locator('tbody tr').last()).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'View portfolio', exact: true })).toBeInViewport({
      ratio: 1,
    });
    const bounds = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
    }));
    expect(bounds.height).toBeLessThanOrEqual(viewport.height);
    expect(bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(
      await table
        .locator('..')
        .evaluate(
          (element) =>
            element.scrollHeight <= element.clientHeight &&
            element.scrollWidth <= element.clientWidth,
        ),
    ).toBe(true);
    expect(state.errors).toEqual([]);
  });
}

for (const [locale, width] of [
  ['zh-Hant', 1600],
  ['en', 820],
  ['zh-Hans', 320],
] as const) {
  test(`overview renders real contracts and stays bounded at ${width}px in ${locale}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1180 });
    const state = await openOverview(page, { locale });
    await expect(page.locator('#monitor-worker-title')).toContainText('4 / 4');
    await expect(page.locator('[data-monitor-overview] tbody tr')).toHaveCount(4);
    await expect(page.locator('[data-monitor-map] [role="button"]')).toHaveCount(6);
    await expect.poll(() => state.subscriptions.length).toBeGreaterThan(0);
    expect(state.subscriptions).toEqual([['workers']]);
    expect(state.requests.filter((url) => url.pathname !== '/monitor/services')).toHaveLength(3);
    for (const url of state.requests.filter((url) => url.pathname !== '/monitor/services')) {
      expect(url.searchParams.get('timezone')).toBe('Asia/Taipei');
      expect(url.searchParams.get('is_caching')).toBe('true');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const broken = await page
      .locator('[data-monitor-workspace] img')
      .evaluateAll(
        (images) =>
          images.filter(
            (image) =>
              !(image as HTMLImageElement).complete || !(image as HTMLImageElement).naturalWidth,
          ).length,
      );
    expect(broken).toBe(0);
    if (width === 320)
      await expect(page.locator('#monitor-traffic > svg')).toHaveAttribute(
        'viewBox',
        '0 0 320 185',
      );
    await page.screenshot({
      path: test.info().outputPath(`monitor-${locale}-${width}.png`),
      fullPage: true,
    });
    expect(state.errors).toEqual([]);
  });
}

test('country ranking, keyboard disclosure and zoom use one login response', async ({ page }) => {
  const state = await openOverview(page);
  await page.locator('#monitor-geography ol button').filter({ hasText: 'Singapore' }).click();
  await expect(page.locator('#monitor-geography [role="tooltip"]')).toContainText('Singapore');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('[data-monitor-map] > g').last()).toHaveAttribute(
    'transform',
    /scale\(1\.5\)/,
  );
  const taiwan = page
    .locator('[data-monitor-map] [role="button"]')
    .filter({ has: page.locator('text', { hasText: 'Taiwan' }) });
  await taiwan.focus();
  await expect(page.locator('#monitor-geography [role="tooltip"]')).toContainText('Taiwan');
  await page.keyboard.press('Escape');
  await expect(page.locator('#monitor-geography [role="tooltip"]')).toHaveCount(0);
  expect(state.requests.filter((url) => url.pathname === '/monitor/logins')).toHaveLength(1);
});

test('period controls update all aggregates atomically and browser Back restores the range', async ({
  page,
}) => {
  const state = await openOverview(page);
  await page.getByRole('button', { name: /^Period:/ }).click();
  await page
    .getByRole('menuitemradio', { name: 'Last 30 days (incl. today)', exact: true })
    .click();
  await expect(page).toHaveURL(/days=30/);
  await expect
    .poll(() => state.requests.filter((url) => url.pathname === '/monitor/traffic').length)
    .toBe(2);
  const latest = state.requests.filter((url) => url.pathname !== '/monitor/services').slice(-3);
  expect(
    new Set(latest.map((url) => `${url.searchParams.get('start')}/${url.searchParams.get('end')}`))
      .size,
  ).toBe(1);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(period));
  await page.getByRole('button', { name: 'Date range', exact: true }).click();
  await page.getByLabel('Start date', { exact: true }).fill('2026-01-01');
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await page.getByLabel('Start date', { exact: true }).fill('2026-10-10');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page).toHaveURL(/start=2026-10-10/);
  await page.getByRole('button', { name: 'Process details', exact: true }).click();
  await expect(page).toHaveURL(/monitorView=workers/);
  await expect(page.locator('[data-monitoring] tbody tr')).toHaveCount(4);
  await page.locator('aside a[href*="monitorView=requests"]').click();
  await expect(page.locator('[data-flow-worker]')).toHaveCount(4);
  await page.locator('aside').getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.locator('[data-monitor-overview]')).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('worker totals pause with snapshots and permission loss closes the workspace', async ({
  page,
}) => {
  await page.clock.install();
  const state = await openOverview(page);
  await page.getByRole('link', { name: 'Workers', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Successful requests', exact: true }),
  ).toContainText('1,000');
  const reads = () =>
    state.requests.filter((url) => url.pathname === '/monitor/request-totals').length;
  await page.getByRole('button', { name: /^Snapshot / }).click();
  const before = reads();
  await page.clock.fastForward(20_000);
  expect(reads()).toBe(before);
  await page.getByRole('button', { name: /^Resume / }).click();
  await expect.poll(reads).toBeGreaterThan(before);
  await page.getByRole('button', { name: /^Snapshot / }).click();
  await page.route('**/api/monitor/request-totals', (route) =>
    route.fulfill({ status: 403, json: { detail: 'PERMISSION_DENIED' } }),
  );
  await page.getByRole('button', { name: /^Resume / }).click();
  await expect(page).toHaveURL(/\/en\/access-denied$/);
  await expect(page.locator('[data-monitor-workspace]')).toHaveCount(0);
});

test('worker totals failure retains unknown counts instead of showing zero', async ({ page }) => {
  await openOverview(page);
  await page.route('**/api/monitor/request-totals', (route) =>
    route.fulfill({ status: 503, json: { detail: 'MONITOR_UNAVAILABLE' } }),
  );
  await page.getByRole('link', { name: 'Workers', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Successful requests', exact: true }),
  ).toContainText('—');
  await expect(page.getByRole('region', { name: 'Failed requests', exact: true })).toContainText(
    '—',
  );
  await expect(
    page.getByRole('table', { name: 'Uvicorn worker status', exact: true }).locator('tbody tr'),
  ).toHaveCount(4);
});

test('pause stops HTTP polling and resume obtains a fresh aggregate', async ({ page }) => {
  await page.clock.install();
  const state = await openOverview(page);
  const count = state.requests.length;
  await page.getByRole('button', { name: 'Update every 30s', exact: true }).click();
  await page.clock.fastForward(65_000);
  expect(state.requests).toHaveLength(count);
  await page.getByRole('button', { name: 'Updates paused', exact: true }).click();
  await expect.poll(() => state.requests.length).toBeGreaterThan(count);
});

test('unknown geography and unsampled health retain unknown values', async ({ page }) => {
  await openOverview(page, {
    override: (path, body) => {
      const value = body as Record<string, unknown>;
      if (path === '/monitor/logins')
        return { ...value, total: 4, countries: [], unknown_users: 4, country_count: 0 };
      if (path === '/monitor/availability')
        return {
          ...value,
          availability_percent: null,
          coverage_percent: 0,
          slo_met: null,
          latest: null,
          current_status: 'unknown',
          series: [],
        };
      return value;
    },
  });
  await expect(
    page.getByText('These accounts have no resolved login location', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Unknown region', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Sampled availability', exact: true }),
  ).toContainText('—');
  await expect(
    page.getByRole('region', { name: 'Sampled availability', exact: true }),
  ).toContainText('SLO unknown');
  await expect(page.locator('[data-monitor-map] [role="button"]')).toHaveCount(0);
  await expect(page.locator('[data-monitor-local-presence]')).toHaveCount(0);
});

for (const width of [320, 1440]) {
  test(`localhost Robot anchors local users and its tooltip at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openOverview(page, {
      override: (path, body) =>
        path === '/monitor/logins'
          ? {
              ...(body as object),
              total: 4,
              countries: [],
              country_count: 0,
              local_users: 3,
              unknown_users: 1,
            }
          : body,
    });
    const marker = page.locator('[data-monitor-local]');
    await marker.scrollIntoViewIfNeeded();
    await marker.click();
    const tooltip = page.locator('#monitor-geography [role="tooltip"]');
    await expect(tooltip).toContainText('Localhost');
    await expect(tooltip).toContainText('75.0%');
    const markerBounds = (await marker.boundingBox())!;
    await page.mouse.move(markerBounds.x - 30, markerBounds.y + markerBounds.height / 2);
    await expect(tooltip).toHaveCount(0);
    await marker.hover();
    await expect(tooltip).toBeVisible();
    await expect(
      page.getByText('These accounts have no resolved login location', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator('#monitor-geography').getByText('Unknown region', { exact: true }).locator('..'),
    ).toContainText('1');
    const corner = await marker.evaluate((element) => {
      const marker = element.getBoundingClientRect();
      const stage = element.parentElement!.getBoundingClientRect();
      return { right: stage.right - marker.right, bottom: stage.bottom - marker.bottom };
    });
    expect(corner).toEqual({ right: 14, bottom: 14 });
    const presence = marker.locator('[data-monitor-local-presence]');
    await expect
      .poll(() => presence.evaluate((element) => element.getAnimations({ subtree: true }).length))
      .toBe(2);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect
      .poll(() => presence.evaluate((element) => element.getAnimations({ subtree: true }).length))
      .toBe(0);
    await expect(presence).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    expect(
      await marker.evaluate((element) => element.getBoundingClientRect().width),
    ).toBeGreaterThanOrEqual(44);
    await page.locator('#monitor-geography ol button').filter({ hasText: 'Localhost' }).click();
    await expect(marker).toHaveAttribute('aria-pressed', 'true');
    await expect(tooltip).toBeInViewport({ ratio: 1 });
    await marker.focus();
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(tooltip).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`monitor-local-${width}.png`),
      fullPage: true,
    });
  });
}

test('authorization loss removes the private overview and redirects', async ({ page }) => {
  let denied = false;
  await openOverview(page, { deny: () => denied });
  denied = true;
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/access-denied$/);
  await expect(page.locator('[data-monitor-workspace]')).toHaveCount(0);
});

test('one failed source retains its cached section and leaves other sources usable', async ({
  page,
}) => {
  await openOverview(page);
  await page.route('**/api/monitor/logins?**', (route) =>
    route.fulfill({ status: 503, json: { detail: 'MONITOR_UNAVAILABLE' } }),
  );
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(
    page.locator('#monitor-geography').getByRole('button', { name: 'Try again', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#monitor-geography ol li')).toHaveCount(6);
  await expect(page.getByRole('region', { name: 'HTTP requests', exact: true })).toContainText(
    '10,840',
  );
  await expect(page.locator('#monitor-worker-title')).toContainText('4 / 4');
});

test('light theme and mobile drawer retain readable navigation and date controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openOverview(page, { theme: 'mist' });
  await expect(page.locator('[data-management-resource="monitoring"]')).toHaveAttribute(
    'data-bs-theme',
    'light',
  );
  await page.getByRole('button', { name: 'Open management navigation', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await drawer.getByRole('link', { name: 'Workers', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.locator('[data-monitoring] tbody tr')).toHaveCount(4);
  await page.screenshot({
    path: test.info().outputPath('monitor-light-mobile.png'),
    fullPage: true,
  });
});

test('public portfolio visits do not download the monitoring workspace', async ({ page }) => {
  const assets: string[] = [];
  page.on('request', (request) => {
    if (/\.(js|css)(\?|$)/.test(request.url())) assets.push(request.url());
  });
  await page.goto('/en');
  await expect(page.locator('[data-online-count]')).toHaveText('3');
  expect(
    assets.some((url) => /MonitorWorkspace|MonitorOverview|monitoring|MonitorLoginMap/.test(url)),
  ).toBe(false);
});

test('default rolling range includes requests and health collected only during the current partial day', async ({
  page,
}) => {
  const today = localDate();
  const state = await openOverview(page, {
    path: '',
    override: (path, body) => {
      const value = body as Record<string, unknown>;
      if (path === '/monitor/traffic')
        return {
          ...value,
          series: (value.series as { date: string; count: number; complete: boolean }[]).map(
            (day) => ({ ...day, count: day.date === today ? 10840 : 0, complete: false }),
          ),
          coverage: { ...(value.coverage as object), complete: false },
          comparison: { ...(value.comparison as object), complete: false, change_percent: null },
        };
      if (path === '/monitor/availability')
        return { ...value, availability_percent: 100, coverage_percent: 0.02, slo_met: null };
      return value;
    },
  });
  await expect(
    page.getByRole('button', { name: 'Period: Last 7 days (incl. today)', exact: true }),
  ).toBeVisible();
  for (const url of state.requests.filter((url) => url.pathname !== '/monitor/services')) {
    expect(url.searchParams.get('end')).toBe(today);
    expect(url.searchParams.get('start')).toBe(shiftDate(today, -6));
  }
  await expect(page.getByRole('region', { name: 'HTTP requests', exact: true })).toContainText(
    '10,840',
  );
  await expect(page.locator('#monitor-traffic > svg')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Sampled availability', exact: true }),
  ).toContainText('100.00%');
  await expect(
    page.getByRole('region', { name: 'Sampled availability', exact: true }),
  ).toContainText('SLO unknown');
});
