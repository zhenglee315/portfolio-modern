import { expect, type Page } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';

async function restore(page: Page) {
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
        user: 'operator',
        email: 'operator@example.com',
        role: 'admin',
        is_create: true,
        is_read: true,
        is_update: true,
        is_delete: true,
        is_monitor: true,
        is_manage_sites: true,
        is_manage_roles: true,
        is_manage_users: true,
      },
    }),
  );
}

async function openPreference(page: Page, key: 'theme' | 'language') {
  const trigger = page.locator('[data-account-menu-trigger]');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  await page.locator(`[data-account-menu-item="${key}"]`).click();
  const panel = page.locator('[data-account-menu]');
  await expect(
    panel.getByRole('button', { name: /Back to settings|返回設定選單|返回设置菜单/ }),
  ).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  return panel;
}

for (const resource of ['sites', 'users', 'roles']) {
  test(`${resource} gear preferences change theme and all locales on the same management resource`, async ({
    page,
  }) => {
    await restore(page);
    await page.goto(`/en/management/${resource}?retained=1#table`);
    await expect(page.locator('tbody tr')).toHaveCount(6);
    const original = page.url();
    const oldRows = await page.locator('tbody').innerText();
    const panel = await openPreference(page, 'theme');
    await panel.locator('[data-theme-option="blue"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blue');
    await expect(panel).toBeVisible();
    expect(page.url()).toBe(original);
    expect(await page.locator('tbody').innerText()).toBe(oldRows);
    for (const label of [/Blink frequency/, /Highlight intensity/]) {
      const slider = panel.getByRole('slider', { name: label });
      await slider.press('End');
      for (let i = 0; i < 5; i++) await slider.press('ArrowLeft');
    }
    await expect(page.locator('html')).toHaveCSS('--field-brightness', '0.75');
    const stored = await page.evaluate(() =>
      JSON.parse(
        decodeURIComponent(
          document.cookie
            .split('; ')
            .find((item) => item.startsWith('portfolio-appearance='))!
            .split('=')[1],
        ),
      ),
    );
    expect(stored).toMatchObject({ theme: 'blue', speed: 1.5, brightness: 75, paused: true });
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-account-menu-item="theme"]')).toBeFocused();
    for (const locale of ['zh-Hant', 'zh-Hans', 'en']) {
      const language = await openPreference(page, 'language');
      await language.locator(`[data-locale="${locale}"]`).click();
      await expect(page).toHaveURL(
        new RegExp(`/${locale}/management/${resource}\\?retained=1#table$`),
      );
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator(`[data-management-resource="${resource}"] tbody tr`)).toHaveCount(
        6,
      );
      await expect(page.locator('[data-account-menu-trigger]')).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    }
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blue');
    const reopened = await openPreference(page, 'theme');
    await expect(reopened.locator('[data-theme-option="blue"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(reopened.getByRole('slider', { name: /Blink frequency/ })).toHaveValue('1.5');
    await reopened.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'mist');
    await expect(reopened).toBeVisible();
  });
}

for (const width of [320, 820, 1440]) {
  test(`gear preferences fit and remain keyboard accessible at ${width}px`, async ({
    page,
  }, info) => {
    await restore(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/en/management/users');
    const panel = await openPreference(page, 'theme');
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
    await panel.screenshot({ path: info.outputPath(`theme-${width}.png`) });
    await panel.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'false');
    await panel.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
    await page.keyboard.press('Escape');
    const language = await openPreference(page, 'language');
    await language.screenshot({ path: info.outputPath(`language-${width}.png`) });
    const current = language.locator('[data-locale="en"]');
    await current.focus();
    await page.keyboard.press('ArrowUp');
    await expect(language.locator('[data-locale="zh-Hant"]')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(current).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-account-menu-item="language"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-account-menu-trigger]')).toBeFocused();
    await openPreference(page, 'theme');
    await page.mouse.click(4, 895);
    await expect(page.locator('[data-account-menu-trigger]')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
}

for (const signedIn of [false, true]) {
  test(`${signedIn ? 'account' : 'guest'} public gear reuses prepared locale changes and owner identity`, async ({
    page,
  }) => {
    if (signedIn) await restore(page);
    await page.goto('/en/sam?retained=1#overview');
    await expect(page.locator('[data-portfolio-user="sam"]')).toBeVisible();
    const panel = await openPreference(page, 'theme');
    await panel.locator('[data-theme-option="amber"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Back to settings' }).click();
    const language = await openPreference(page, 'language');
    await language.locator('[data-locale="zh-Hant"]').click();
    await expect(page).toHaveURL(/\/zh-Hant\/sam\?retained=1#overview$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
    await expect(page.locator('[data-portfolio-user="sam"]')).toBeVisible();
    await expect(page.locator('[data-account-menu-trigger]')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const reopened = await openPreference(page, 'language');
    await expect(reopened.locator('[data-locale="zh-Hant"]')).toHaveAttribute(
      'aria-current',
      'true',
    );
  });
}
