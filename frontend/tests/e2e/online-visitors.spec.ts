import { expect, test } from '@playwright/test';
import { waitForFixtureHydration } from '../fixtures/browser';

test('online count leads the social controls and remains independent of the collapsed rail', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/en');
  const rail = page.locator('aside');
  const controls = page.locator('[data-profile-controls]');
  const count = controls.locator('[data-online-visitors]');
  const language = controls.getByRole('button', { name: 'Change language' });
  const copyright = rail.locator('[data-nav-footer] small');
  const login = rail.getByRole('button', { name: 'Sign in' });
  await expect(count).toHaveAccessibleName('Online now: 3');
  await expect(count.locator('svg.bi-person-hearts')).toBeVisible();
  await expect(copyright).toBeVisible();
  await expect(login.locator('svg.bi-door-open-fill')).toBeVisible();
  await expect(page.locator('[data-online-visitors]')).toHaveCount(1);
  await expect(rail.locator('[data-online-visitors]')).toHaveCount(0);
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  const textBox = (await copyright.boundingBox())!;
  const countBox = (await count.boundingBox())!;
  const loginBox = (await login.boundingBox())!;
  const languageBox = (await language.boundingBox())!;
  const socialLinks = controls.locator('a.icon-button');
  expect(await socialLinks.count()).toBeGreaterThan(0);
  for (const link of await socialLinks.all()) {
    const box = (await link.boundingBox())!;
    expect(countBox.x + countBox.width).toBeLessThanOrEqual(box.x);
    expect(box.x + box.width).toBeLessThanOrEqual(languageBox.x);
  }
  expect(loginBox.x).toBeGreaterThanOrEqual(textBox.x + textBox.width);
  await controls.screenshot({ path: testInfo.outputPath('online-socials-expanded.png') });

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(copyright).not.toBeVisible();
  await expect(count).toBeVisible();
  await expect(login).toBeVisible();
  await expect(count.locator('[data-online-count]')).toHaveText('3');
  await expect(rail).toHaveCSS('width', '80px');
  await expect(rail.locator('[data-online-visitors]')).toHaveCount(0);
  await controls.screenshot({ path: testInfo.outputPath('online-socials-collapsed.png') });
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(copyright).toBeVisible();
  await expect(count).toBeVisible();
});

test('localized mobile online count belongs to the social controls rather than the drawer', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/zh-Hant');
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  const controls = page.locator('[data-profile-controls]');
  const count = controls.locator('[data-online-visitors]');
  await expect(count).toHaveAccessibleName('目前在線：3');
  await expect(count.locator('[data-online-count]')).toBeVisible();
  await expect(page.locator('[data-online-visitors]')).toHaveCount(1);
  await controls.screenshot({ path: testInfo.outputPath('online-mobile-socials.png') });
  await count.click();
  await expect(page.getByRole('tooltip')).toHaveText('目前在線人數：3');
  await expect(page.getByRole('tooltip')).toHaveAttribute('data-side-left', 'false');
  await page.screenshot({ path: testInfo.outputPath('online-mobile-tooltip.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.getByRole('button', { name: '開啟導覽' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.locator('[data-online-visitors]')).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: '登入' })).toBeVisible();
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
});

for (const [locale, text] of [
  ['en', 'People online now: 3'],
  ['zh-Hans', '当前在线人数：3'],
  ['zh-Hant', '目前在線人數：3'],
]) {
  test(`${locale} online hover tooltip shares the pixel shell and stays hoverable`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/${locale}`);
    await expect(page.locator('[data-entering]')).toHaveCount(0);
    const count = page.locator('[data-profile-controls] [data-online-visitors]');
    await expect(count.locator('[data-online-count]')).toHaveText('3');
    await count.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toHaveText(text!);
    await expect(tooltip).toHaveAttribute('data-side-left', 'true');
    await expect(tooltip.locator('button')).toHaveCount(0);
    expect(await tooltip.evaluate((node) => !!node.closest('[data-profile-controls]'))).toBe(false);
    const box = (await tooltip.boundingBox())!;
    const triggerBox = (await count.boundingBox())!;
    expect(box.x + box.width).toBeLessThan(triggerBox.x);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.screenshot({ path: testInfo.outputPath(`online-tooltip-${locale}.png`) });
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await count.hover();
    await expect(tooltip).toHaveText(text!);
    await page.mouse.move(5, 700);
    await expect(tooltip).toHaveCount(0);
    await page
      .getByRole('button', {
        name:
          locale === 'en' ? 'Collapse sidebar' : locale === 'zh-Hans' ? '收合导航栏' : '收合導覽欄',
      })
      .click();
    await expect(page.locator('aside')).toHaveCSS('width', '80px');
    await count.hover();
    await expect(tooltip).toHaveText(text!);
    await page.screenshot({ path: testInfo.outputPath(`online-tooltip-compact-${locale}.png`) });
  });
}

test('keyboard focus opens the online tooltip and Escape dismisses it without moving focus', async ({
  page,
}) => {
  await page.goto('/en');
  await waitForFixtureHydration(page);
  await page.keyboard.press('Tab');
  const count = page.locator('[data-profile-controls] [data-online-visitors]');
  await count.focus();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toHaveText('People online now: 3');
  await expect(count).toHaveAttribute('aria-describedby', (await tooltip.getAttribute('id'))!);
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await expect(count).toBeFocused();
  await expect(count).not.toHaveAttribute('aria-describedby');
});

test('polling preserves stale data, pauses when hidden and recovers when visible', async ({
  page,
}) => {
  await page.clock.install();
  let reads = 0;
  let invalid = false;
  await page.route('**/api/system/heartbeat', (route) => {
    reads += 1;
    return route.fulfill({ json: { online: invalid ? 'invalid' : reads } });
  });
  await page.goto('/en');
  const count = page.locator('[data-profile-controls] [data-online-visitors]');
  await expect(count).toHaveAccessibleName('Online now: 1');
  invalid = true;
  await page.clock.fastForward(44_000);
  expect(reads).toBe(1);
  await page.clock.fastForward(1_000);
  await expect(count).toHaveAccessibleName(/Last known online count: 1/);
  await expect(count.locator('[data-online-count]')).toHaveText('1');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenReads = reads;
  await page.clock.fastForward(90_000);
  expect(reads).toBe(hiddenReads);
  invalid = false;
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(count).toHaveAccessibleName(`Online now: ${hiddenReads + 1}`);
});

test('an unavailable first count stays a dash while the portfolio remains usable', async ({
  page,
}) => {
  await page.route('**/api/system/heartbeat', (route) => route.fulfill({ json: {} }));
  await page.goto('/en');
  const count = page.locator('[data-profile-controls] [data-online-visitors]');
  await expect(count).toHaveAccessibleName('Online count unavailable.');
  await expect(count.locator('[data-online-count]')).toHaveText('—');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(count).toBeVisible();
  await expect(page.locator('h1[data-profile-content]')).toBeVisible();
});
