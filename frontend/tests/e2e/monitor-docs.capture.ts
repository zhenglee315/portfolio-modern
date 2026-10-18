import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { monitorEndpointFixture, monitorSocketFixture } from '../fixtures/monitor';
import { installMonitorSocket } from '../fixtures/monitor-browser';

/** Capture the real application with isolated, explicitly synthetic observations.
 * @author ZhengLee 2026.10.18
 */
test('capture the monitoring documentation tour', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.context().addCookies([
    {
      name: 'portfolio-appearance',
      value: encodeURIComponent(JSON.stringify({ theme: 'mint', paused: true })),
      url: 'http://127.0.0.1:4173',
    },
  ]);
  await page.route('**/api/authority/session', (route) =>
    route.fulfill({
      json: {
        id: 91,
        user: 'demo-operator',
        email: 'operator@example.test',
        role: 'administrator',
        is_create: true,
        is_read: true,
        is_update: true,
        is_delete: true,
        is_manage_sites: true,
        is_manage_roles: true,
        is_manage_users: true,
      },
    }),
  );
  await page.route('**/api/monitor/**', (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace('/api/monitor/', '/monitor/');
    const body = monitorEndpointFixture(url);
    if (url.pathname === '/monitor/logins') {
      // Reserve a separate, non-geographic Localhost category for the Robot marker.
      Object.assign(body!, {
        total: 1250,
        local_users: 2,
        countries: (body as { countries: { users: number; percent: number }[] }).countries.map(
          (country) => ({ ...country, percent: Math.round((country.users / 1250) * 1000) / 10 }),
        ),
      });
    }
    return route.fulfill({ json: body });
  });
  await installMonitorSocket(page, (topic, revision) => {
    const snapshot = monitorSocketFixture(topic, revision);
    return {
      ...snapshot,
      data: {
        ...snapshot.data,
        summary: {
          ...snapshot.data.summary,
          recent_completed_requests: 7,
          recent_average_duration_ms: 23,
          recent_max_duration_ms: 41,
        },
        requests: Array.from({ length: 7 }, (_, index) => ({
          request_id: `demo-request-${index + 1}`,
          instance_id: 'fixture',
          run_id: 'fixture-run',
          process_uid: `fixture-worker-${index % 4}`,
          pid: 18421 + (index % 4),
          slot: (index % 4) + 1,
          method: 'GET',
          path: ['/portfolio/site', '/portfolio/projects', '/portfolio/skills'][index % 3],
          entered_at: snapshot.sampled_at - 2 - index,
          left_at: snapshot.sampled_at - 2 - index + 0.023,
          observed_at: snapshot.sampled_at,
          status: 'completed',
          phase: 'response_complete',
          elapsed_ms: 23,
          duration_ms: 23,
          http_status: 200,
          fresh: true,
          ip_address: '127.0.0.1',
          country_code: null,
          region: null,
          city: null,
          geo_status: 'non_public',
          location: 'local',
        })),
      },
    };
  });
  const images = resolve('..', 'docs', 'images');
  await page.goto('/en/management/monitoring?start=2026-10-09&end=2026-10-15');
  await expect(page.locator('#monitor-worker-title')).toContainText('4 / 4');
  await expect(page.getByRole('region', { name: 'HTTP requests', exact: true })).toContainText(
    '10,840',
  );
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.click(2, 2);
  await page.screenshot({ path: resolve(images, 'monitor-overview.png'), fullPage: true });

  await page.getByRole('link', { name: 'Requests', exact: true }).click();
  await expect(page.locator('[data-monitor-view="requests"]')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'How requests pass through workers' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Request events', exact: true }).locator('tbody tr'),
  ).toHaveCount(5);
  await page.mouse.click(2, 2);
  await expect(
    page.locator('[data-sidebar-rail]').getByRole('link', { name: 'Overview', exact: true }),
  ).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.screenshot({ path: resolve(images, 'monitor-requests.png'), fullPage: true });
  await page.getByRole('region', { name: 'Request events', exact: true }).screenshot({
    path: resolve(images, 'monitor-events.png'),
  });

  await page.getByRole('link', { name: 'Workers', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 780 });
  await expect(
    page.getByRole('region', { name: 'Successful requests', exact: true }),
  ).toContainText('1,000');
  await expect(
    page.getByRole('table', { name: 'Uvicorn worker status', exact: true }),
  ).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(
    page.locator('[data-sidebar-rail]').getByRole('link', { name: 'Requests', exact: true }),
  ).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
    .toBeLessThanOrEqual(780);
  await page.screenshot({ path: resolve(images, 'monitor-workers.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/management/monitoring?start=2026-10-09&end=2026-10-15');
  await expect(page.locator('[data-monitor-local]')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await page.screenshot({ path: resolve(images, 'monitor-overview-mobile.png'), fullPage: true });
});
