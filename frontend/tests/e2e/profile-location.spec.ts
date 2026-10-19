import { expect, type Page } from '@playwright/test';
import { runtimeTest } from '../fixtures/browser';
import { openEditor, field, save, draftKey } from '../fixtures/profile-editor';
import { ownerProfileSnapshot } from '../fixtures/profile-owner';

// Use the actual shipped dataset. Every scenario rejects external hosts, including tile/CDN calls.
const test = runtimeTest.extend<{ sameOriginOnly: void }>({
  sameOriginOnly: [
    async ({ page, baseURL }, use) => {
      const outside: string[] = [];
      const origin = new URL(baseURL!).origin;
      await page.route(/^https?:\/\//, async (route) => {
        if (new URL(route.request().url()).origin === origin) await route.fallback();
        else {
          outside.push(route.request().url());
          await route.abort();
        }
      });
      await use();
      expect(outside).toEqual([]);
    },
    { auto: true },
  ],
});
test.use({ hasTouch: true });
async function openMap(page: Page) {
  await page.getByRole('button', { name: 'Choose on map', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose on map', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-location-map]')).toHaveAttribute('data-map-status', 'ready');
  await expect(dialog.locator('.leaflet-overlay-pane svg').first()).toBeVisible();
  return dialog;
}

test('the map loads on demand, selects a point, confirms coordinates and saves the career draft', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/leaflet-src|offline-atlas/.test(request.url())) requests.push(request.url());
  });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await openEditor(page, '/en/profile?section=experience&edit=experience%3A3');
  const before = await field(page, 'Latitude').inputValue();
  await expect(field(page, 'Latitude')).toHaveAttribute('readonly', '');
  expect(requests).toEqual([]);
  const dialog = await openMap(page);
  await expect(dialog.getByText('Natural Earth · Public domain', { exact: true })).toBeVisible();
  expect(requests.some((url) => /offline-atlas.*\.json/.test(url))).toBe(true);
  const map = dialog.locator('[data-location-map]');
  await map.click({ position: { x: 200, y: 130 } });
  const latitude = (await dialog.locator('[data-location-coordinate="latitude"]').textContent())!;
  const longitude = (await dialog.locator('[data-location-coordinate="longitude"]').textContent())!;
  expect(Number(latitude)).not.toBe(Number(before));
  await expect(field(page, 'Latitude')).toHaveValue(before);
  await dialog.getByRole('button', { name: 'Confirm location', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(field(page, 'Latitude')).toHaveValue(latitude);
  await expect(field(page, 'Longitude')).toHaveValue(longitude);
  await expect(field(page, 'City')).toHaveValue('Suzhou · Wujiang');
  await save(page);
  await page.reload();
  await expect(field(page, 'Latitude')).toHaveValue(latitude);
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), draftKey);
  expect(stored.experiences['experience:3'].longitude).toBe(longitude);
});

test('cancel and Escape retain original coordinates and restore focus to the picker trigger', async ({
  page,
}) => {
  await openEditor(page, '/en/profile?section=experience&edit=experience%3A3');
  const before = await field(page, 'Latitude').inputValue();
  let dialog = await openMap(page);
  await dialog.locator('[data-location-map]').click({ position: { x: 120, y: 100 } });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(field(page, 'Latitude')).toHaveValue(before);
  await expect(page.getByRole('button', { name: 'Choose on map', exact: true })).toBeFocused();
  dialog = await openMap(page);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(field(page, 'Latitude')).toHaveValue(before);
});

test('an empty location requires a selection, supports map keyboard navigation and center selection', async ({
  page,
}) => {
  await openEditor(page, '/en/profile?section=experience&edit=experience%3A3');
  await page.evaluate(
    ({ key, draft }) => {
      draft.experiences['experience:3']!.latitude = '';
      draft.experiences['experience:3']!.longitude = '';
      localStorage.setItem(key, JSON.stringify(draft));
    },
    { key: draftKey, draft: ownerProfileSnapshot() },
  );
  await page.reload();
  const dialog = await openMap(page);
  await expect(
    dialog.getByRole('button', { name: 'Confirm location', exact: true }),
  ).toBeDisabled();
  const map = dialog.locator('[data-location-map]');
  await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await map.focus();
  await map.press('ArrowRight');
  await dialog.getByRole('button', { name: 'Use map center', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Confirm location', exact: true })).toBeEnabled();
  await expect(dialog.locator('[data-location-marker]')).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm location', exact: true }).click();
  expect(Number(await field(page, 'Longitude').inputValue())).toBeGreaterThan(0);
});

test('local dataset failures offer retry without discarding the selected coordinates', async ({
  page,
}) => {
  let available = false;
  await page.route('**/offline-atlas-*.json', (route) =>
    available
      ? route.fallback()
      : route.fulfill({ contentType: 'application/json', body: '{"version":0}' }),
  );
  await openEditor(page, '/en/profile?section=experience&edit=experience%3A3');
  await page.getByRole('button', { name: 'Choose on map', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose on map', exact: true });
  await expect(dialog.getByText('The local map data could not load. Try again.')).toBeVisible();
  const before = await dialog.locator('[data-location-coordinate="latitude"]').textContent();
  available = true;
  await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(dialog.locator('[data-location-map]')).toHaveAttribute('data-map-status', 'ready');
  await expect(dialog.getByText('The local map data could not load. Try again.')).toHaveCount(0);
  await expect(dialog.locator('[data-location-coordinate="latitude"]')).toHaveText(before!);
});

test('offline city search accepts English/Chinese and selects the correct city without editing names', async ({
  page,
}) => {
  await openEditor(page, '/en/profile?section=experience&edit=experience%3A3');
  const dialog = await openMap(page);
  const search = dialog.getByRole('searchbox', { name: 'Search cities offline', exact: true });
  await search.fill('London GB');
  const results = dialog.getByRole('list', { name: 'City search results', exact: true });
  await expect(results.getByRole('button').first()).toContainText(
    'London · Westminster · United Kingdom',
  );
  await results.getByRole('button').first().click();
  await expect(dialog.locator('[data-location-coordinate="latitude"]')).toHaveText('51.501941');
  await expect(dialog.locator('[data-location-coordinate="longitude"]')).toHaveText('-0.118668');
  await search.fill('台北');
  await expect(results.getByRole('button').first()).toBeVisible();
  await search.fill('伦敦');
  await expect(results.getByRole('button').first()).toBeVisible();
  await search.fill('no-matching-city-123');
  await expect(
    dialog.getByText('No matching city. Try another name or choose directly on the map.'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm location', exact: true }).click();
  await expect(field(page, 'Latitude')).toHaveValue('51.501941');
  await expect(field(page, 'City')).toHaveValue('Suzhou · Wujiang');
});

for (const [width, height, theme] of [
  [390, 844, 'mist'],
  [1600, 1100, 'mint'],
] as const) {
  test(`location modal fits ${width}px and supports zoom, panning and marker adjustment`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await openEditor(page, '/en/profile?section=experience&edit=experience%3A3', theme);
    const dialog = await openMap(page);
    if (width === 390) {
      const area = (await dialog.locator('[data-location-map]').boundingBox())!;
      const previous = await dialog.locator('[data-location-coordinate="latitude"]').textContent();
      await page.touchscreen.tap(area.x + 60, area.y + 80);
      await expect(dialog.locator('[data-location-coordinate="latitude"]')).not.toHaveText(
        previous!,
      );
    }
    await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const map = dialog.locator('[data-location-map]');
    await map.scrollIntoViewIfNeeded();
    const box = (await map.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.65, { steps: 10 });
    await page.mouse.up();
    await dialog.getByRole('button', { name: 'Use map center', exact: true }).click();
    const marker = dialog.locator('[data-location-marker]');
    await marker.scrollIntoViewIfNeeded();
    const pin = (await marker.boundingBox())!;
    const previous = await dialog.locator('[data-location-coordinate="latitude"]').textContent();
    await page.mouse.move(pin.x + pin.width / 2, pin.y + pin.height / 2);
    await page.mouse.down();
    await page.mouse.move(pin.x + pin.width / 2 + 25, pin.y + pin.height / 2 + 35, { steps: 12 });
    await page.mouse.up();
    await expect(dialog.locator('[data-location-coordinate="latitude"]')).not.toHaveText(previous!);
    const bounds = (await dialog.locator('.modal-dialog').boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('location-modal.png') });
  });
}
