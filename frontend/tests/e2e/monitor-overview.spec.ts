import { expect, test, type Page } from '@playwright/test';
import { monitorEndpointFixture, monitorSocketFixture } from '../fixtures/monitor';
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
  is_monitor: true,
  is_manage_sites: true,
};

/** Retained busy/completed/failed observations shared by phone and desktop checks. */
function phoneSocketFixture(topic: string, revision: string) {
  const snapshot = monitorSocketFixture(topic, revision);
  return {
    ...snapshot,
    data: {
      ...snapshot.data,
      workers: snapshot.data.workers.map((worker, index) => ({
        ...worker,
        active_requests: index === 0 ? 2 : index === 1 ? 1 : 0,
      })),
      summary: {
        ...snapshot.data.summary,
        active_requests: 3,
        busy_workers: 2,
        idle_workers: 2,
        recent_completed_requests: 5,
        recent_average_duration_ms: 86,
        recent_max_duration_ms: 142,
      },
      requests: Array.from({ length: 7 }, (_, index) => ({
        request_id: `phone-${index}-observation`,
        instance_id: 'fixture',
        run_id: 'fixture-run',
        process_uid: `fixture-worker-${index % 4}`,
        pid: 18421 + (index % 4),
        slot: (index % 4) + 1,
        method: index % 2 ? 'POST' : 'GET',
        path:
          index === 0
            ? `/portfolio/projects/${'long-route-segment-'.repeat(5)}`
            : '/portfolio/site',
        entered_at: snapshot.sampled_at - 2 - index,
        left_at: index < 2 ? null : snapshot.sampled_at - 2 - index + 0.086,
        observed_at: snapshot.sampled_at,
        status: index < 2 ? 'processing' : 'completed',
        phase: index < 2 ? 'application' : 'response_complete',
        elapsed_ms: 86,
        duration_ms: index < 2 ? null : 86,
        http_status: index < 2 ? null : index === 2 ? 503 : 200,
        fresh: true,
        ip_address: '::1',
        country_code: null,
        region: null,
        city: null,
        geo_status: 'non_public',
        location: 'Localhost',
      })),
    },
  };
}

async function openOverview(
  page: Page,
  options: {
    locale?: string;
    path?: string;
    override?: (path: string, body: unknown) => unknown;
    deny?: () => boolean;
    theme?: 'mint' | 'blue' | 'amber' | 'mist';
    account?: Partial<typeof administrator>;
    socket?: (topic: string, revision: string) => unknown;
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
  await page.route('**/api/authority/session', (route) =>
    route.fulfill({ json: { ...administrator, ...options.account } }),
  );
  await page.route('**/api/monitor/**', (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace('/api/monitor/', '/monitor/');
    requests.push(url);
    if (options.deny?.() && url.pathname === '/monitor/traffic')
      return route.fulfill({ status: 403, json: { detail: 'PERMISSION_DENIED' } });
    const body = monitorEndpointFixture(url);
    return route.fulfill({ json: options.override ? options.override(url.pathname, body) : body });
  });
  const subscriptions = await installMonitorSocket(page, options.socket);
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

test('monitor-only accounts can use all monitoring views without management access', async ({
  page,
}) => {
  await openOverview(page, {
    account: {
      is_monitor: true,
      is_manage_sites: false,
      is_manage_roles: false,
      is_manage_users: false,
    },
  });
  const links = page.locator('[data-sidebar-rail] [data-sidebar-links]').first();
  await expect(links.getByRole('link')).toHaveText(['Overview', 'Requests', 'Workers']);
  await links.getByRole('link', { name: 'Requests', exact: true }).click();
  await expect(page.locator('[data-monitor-view="requests"]')).toBeVisible();
  await links.getByRole('link', { name: 'Workers', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Successful requests', exact: true }),
  ).toContainText('1,000');
  await page.goto('/en/management/sites');
  await expect(page).toHaveURL(/\/en\/access-denied$/);
});

for (const view of ['', '?monitorView=requests', '?monitorView=workers']) {
  test(`site management alone cannot open monitoring ${view || 'overview'}`, async ({ page }) => {
    const reads: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/monitor/')) reads.push(request.url());
    });
    await page.route('**/api/authority/session', (route) =>
      route.fulfill({ json: { ...administrator, is_monitor: false } }),
    );
    const subscriptions = await installMonitorSocket(page);
    await page.goto(`/en/management/monitoring${view}`);
    await expect(page).toHaveURL(/\/en\/access-denied$/);
    expect(reads).toEqual([]);
    expect(subscriptions).toEqual([]);
  });
}

test('role management places the Monitor permission directly after Delete', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.route('**/api/authority/session', (route) => route.fulfill({ json: administrator }));
  await page.goto('/en/management/roles');
  const table = page.locator('[data-management-resource="roles"] table');
  await expect(table.locator('tbody tr')).toHaveCount(6);
  await expect(table.locator('thead [data-column-title]')).toHaveText([
    'ID',
    'Role',
    'Create',
    'Read',
    'Update',
    'Delete',
    'Monitor',
    'Site',
    'Users',
    'Roles',
    'Default',
    'Active',
    'Updated',
    'Actions',
  ]);
  await expect(
    table
      .locator('tbody tr')
      .first()
      .getByRole('switch', { name: /^Monitor:/ }),
  ).toBeVisible();
});

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
    await expect(
      page.locator(
        width <= 760 ? '[data-monitor-worker-card]' : '[data-monitor-overview] tbody tr',
      ),
    ).toHaveCount(4);
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

for (const locale of ['en', 'zh-Hant', 'zh-Hans'] as const) {
  for (const width of [320, 375, 412, 760]) {
    test(`phone monitor content follows the Figma layout at ${width}px in ${locale}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      const theme =
        width === 375 ? 'mist' : width === 412 ? 'mint' : width === 760 ? 'amber' : 'blue';
      const state = await openOverview(page, { locale, socket: phoneSocketFixture, theme });
      await expect(page.locator('[data-management-resource="monitoring"]')).not.toHaveAttribute(
        'data-entering',
      );
      const cards = page.locator('[data-monitor-overview] > div').first().getByRole('region');
      await expect(cards).toHaveCount(4);
      const boxes = await cards.evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width };
        }),
      );
      expect(Math.abs(boxes[0]!.y - boxes[3]!.y)).toBeLessThan(1);
      expect(Math.abs(boxes[1]!.y - boxes[2]!.y)).toBeLessThan(1);
      expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y);
      await expect(page.locator('[data-monitor-worker-card]')).toHaveCount(4);
      await expect(page.locator('[data-monitor-overview] table')).toHaveCount(0);
      await expect(page.locator('[data-monitor-map]')).toBeVisible();
      await expect(page.locator('#monitor-traffic > svg')).toBeVisible();
      const country = page.locator('[data-monitor-map] [role="button"]').first();
      await country.click();
      const tooltip = page.locator('#monitor-geography [role="tooltip"]');
      await expect(tooltip).toBeVisible();
      const tooltipBounds = (await tooltip.boundingBox())!;
      const stageBounds = (await page.locator('[data-monitor-map]').locator('..').boundingBox())!;
      expect(tooltipBounds.x).toBeGreaterThanOrEqual(stageBounds.x);
      expect(tooltipBounds.x + tooltipBounds.width).toBeLessThanOrEqual(
        stageBounds.x + stageBounds.width,
      );
      expect(tooltipBounds.y).toBeGreaterThanOrEqual(stageBounds.y);
      expect(tooltipBounds.y + tooltipBounds.height).toBeLessThanOrEqual(
        stageBounds.y + stageBounds.height,
      );
      await page.keyboard.press('Escape');
      await expect(tooltip).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (locale === 'zh-Hant' && [320, 412].includes(width)) {
        await page.locator('[data-monitor-workspace] h1').click();
        await page.screenshot({
          path: test.info().outputPath(`overview-phone-${width}.png`),
          fullPage: true,
        });
      }
      await page.goto(`/${locale}/management/monitoring?${period}&monitorView=requests`);
      await expect(page.locator('[data-management-resource="monitoring"]')).not.toHaveAttribute(
        'data-entering',
      );
      const flow = page.locator('[data-flow-worker]');
      await expect(flow).toHaveCount(4);
      const client = (await page.locator('[data-flow-client]').boundingBox())!;
      const first = (await flow.first().boundingBox())!;
      expect(first.y).toBeGreaterThan(client.y + client.height);
      const stages = await flow
        .first()
        .locator('[data-flow-stages] > span')
        .evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().y));
      expect(stages[1]).toBeGreaterThan(stages[0]!);
      expect(stages[2]).toBeGreaterThan(stages[1]!);
      const events = page.locator('[data-monitor-event-cards] article');
      await expect(events).toHaveCount(5);
      await expect(events.first()).toContainText('long-route-segment');
      await expect(events.nth(2)).toContainText('HTTP 503');
      await events.first().locator('summary').click();
      await expect(events.first().locator('details')).toHaveAttribute('open', '');
      await expect(events.first().locator('details')).toContainText('::1');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        await page
          .locator('[data-flow-client]')
          .locator('..')
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      for (const selector of ['[data-flow-worker]', '[data-monitor-event-cards] article']) {
        expect(
          await page
            .locator(selector)
            .evaluateAll((elements) => elements.some((el) => el.scrollWidth > el.clientWidth)),
        ).toBe(false);
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('[data-background-field]')).toBeVisible();
      if (locale === 'zh-Hant' && [320, 412].includes(width)) {
        await events.first().locator('summary').click();
        await page.locator('[data-monitor-workspace] h1').click();
        await page.screenshot({
          path: test.info().outputPath(`requests-phone-${width}.png`),
          fullPage: true,
        });
      }
      expect(state.errors).toEqual([]);
    });
  }
}

test('phone request cards keep worker filtering, paging and desktop resize on the same observations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 844 });
  const state = await openOverview(page, { socket: phoneSocketFixture });
  await page.goto(`/en/management/monitoring?${period}&monitorView=requests`);
  const cards = page.locator('[data-monitor-event-cards] article');
  await expect(cards).toHaveCount(5);
  await page.getByRole('button', { name: '→', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole('button', { name: 'Filter worker: All workers', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'W1 / 18421', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('phone-0-');
  await expect(cards.last()).toContainText('phone-4-');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(page.locator('[data-monitor-event-cards]')).toHaveCount(0);
  const table = page.locator('[data-monitoring] table');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  const stageBounds = await page
    .locator('[data-flow-worker]')
    .first()
    .locator('[data-flow-stages] > span')
    .evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().y));
  expect(Math.max(...stageBounds) - Math.min(...stageBounds)).toBeLessThan(1);
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(cards).toHaveCount(2);
  expect(state.errors).toEqual([]);
});
