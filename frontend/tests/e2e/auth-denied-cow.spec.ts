import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Locale = 'en' | 'zh-Hant';
type Copy = { auth: Record<string, string>; accessDenied: Record<string, string> };
const messages = Object.fromEntries(
  ['en', 'zh-Hant'].map((locale) => [
    locale,
    JSON.parse(
      readFileSync(new URL(`../../src/i18n/messages/${locale}.json`, import.meta.url), 'utf8'),
    ),
  ]),
) as Record<Locale, Copy>;
const signIn = '**/api/authority/sign-in';
const test = base.extend<{ authRuntime: void }>({
  authRuntime: [
    async ({ page }, use) => {
      const errors: string[] = [];
      const managementReads: string[] = [];
      const otherAuthWrites: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        if (pathname.startsWith('/api/management/')) managementReads.push(pathname);
        if (
          pathname.startsWith('/api/authority/') &&
          request.method() !== 'GET' &&
          !pathname.endsWith('/sign-in')
        )
          otherAuthWrites.push(pathname);
      });
      await use();
      expect(errors).toEqual([]);
      expect(managementReads).toEqual([]);
      expect(otherAuthWrites).toEqual([]);
    },
    { auto: true },
  ],
});

async function openLogin(page: Page, locale: Locale = 'en') {
  await page.goto(`/${locale}?view=login`);
  await expect(page.locator('[data-auth-phase]')).toHaveAttribute('data-auth-phase', 'auth');
  const panel = page.locator('[data-auth-panel]');
  await expect(panel).toBeVisible();
  const cow = panel.locator('[data-auth-cow]');
  await expect(cow.locator('[data-cow-scene]')).toBeVisible();
  return {
    panel,
    cow,
    workspace: cow.locator('[data-cow-scene]'),
    email: panel.getByLabel(messages[locale].auth.email!, { exact: true }),
    password: panel.getByLabel(messages[locale].auth.password!, { exact: true }),
    submit: panel
      .locator('form')
      .getByRole('button', { name: messages[locale].auth.login!, exact: true }),
  };
}

async function fillCredentials(login: Awaited<ReturnType<typeof openLogin>>) {
  await login.email.fill('person@example.com');
  await login.password.fill('incorrect-password');
}

async function denied(cow: Locator) {
  await expect(cow).toHaveAttribute('data-auth-cow-denied', 'true');
  await expect(cow.locator('[data-cow-arm-pose="no-entry"]')).toBeVisible();
  await expect(cow.locator('[data-cow-arm-pose="mouth-covering"]')).toBeVisible();
  await expect(cow.locator('[data-denied-cow-pupil]')).toHaveCount(2);
  await expect(cow.locator('[data-cow-eye-state]')).toHaveCount(0);
}

async function restored(cow: Locator) {
  await expect(cow).not.toHaveAttribute('data-auth-cow-denied', 'true');
  await expect(cow.locator('[data-cow-arm-pose="no-entry"]')).toHaveCount(0);
  await expect(cow.locator('[data-denied-cow-pupil]')).toHaveCount(0);
  await expect(cow.locator('[data-cow-eye-state]')).toHaveCount(3);
}

async function rowBounds(
  page: Page,
  cow: Locator,
  width: number,
  height: number,
  locale: Locale = 'en',
) {
  expect(
    await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    ),
  ).toBeLessThanOrEqual(width);
  const controls = cow.getByRole('group', {
    name: messages[locale].auth.cowPlayback!,
    exact: true,
  });
  await expect(controls.getByRole('button')).toHaveCount(4);
  await controls.scrollIntoViewIfNeeded();
  for (const button of await controls.getByRole('button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
  }
}

for (const { width, height, mode, status, field } of [
  { width: 320, height: 568, mode: 'cowCycle', status: 401, field: 'email' },
  { width: 568, height: 320, mode: 'cowWatching', status: 403, field: 'password' },
  { width: 1503, height: 776, mode: 'cowCoding', status: 401, field: 'password' },
] as const) {
  test.describe(`${width}x${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: width < 1024, isMobile: width < 1024 });
    test('invalid credentials replace only the character and editing restores the original mode and paused preferences', async ({
      page,
    }) => {
      let requests = 0;
      await page.route(signIn, (route) => {
        requests++;
        return route.fulfill({ status, json: { detail: 'INVALID_CREDENTIALS' } });
      });
      const login = await openLogin(page);
      const selected = login.cow.getByRole('button', {
        name: messages.en.auth[mode]!,
        exact: true,
      });
      await selected.click();
      for (const key of ['cowGlobeRotate', 'cowLeavesSway', 'cowMouseFollow', 'cowPause'])
        await login.cow.getByRole('button', { name: messages.en.auth[key]!, exact: true }).click();
      const original = await login.workspace.elementHandle();
      const phase = await login.workspace.getAttribute('data-cow-phase');
      await fillCredentials(login);
      await login.submit.click();
      await denied(login.cow);
      await expect(page.getByRole('status')).toContainText(messages.en.auth.invalidCredentials!);
      await expect(page).toHaveURL('/en?view=login');
      await expect(selected).toHaveAttribute('aria-pressed', 'true');
      await expect(login.workspace).toHaveAttribute('data-cow-phase', phase!);
      expect(
        await login.workspace.evaluate((element, previous) => element === previous, original),
      ).toBe(true);
      await rowBounds(page, login.cow, width, height);
      if (width === 320 || width === 1503) {
        if (width === 320) {
          await page.locator('[data-notification-kind]').getByRole('button').click();
          await denied(login.cow);
        }
        await login.cow.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: test
            .info()
            .outputPath(`auth-denied-cow-${width === 320 ? 'mobile' : 'desktop'}.png`),
          fullPage: true,
        });
      }
      await login.email.focus();
      await denied(login.cow);
      if (field === 'email') await login.email.fill('other@example.com');
      else await login.password.fill('');
      await restored(login.cow);
      await expect(login.workspace).toHaveAttribute('data-cow-phase', phase!);
      await expect(login.workspace).toHaveAttribute('data-cow-motion', 'paused');
      for (const key of ['cowGlobeRotate', 'cowLeavesSway', 'cowMouseFollow'])
        await expect(
          login.cow.getByRole('button', { name: messages.en.auth[key]!, exact: true }),
        ).toHaveAttribute('aria-pressed', 'false');
      expect(
        await login.workspace.evaluate((element, previous) => element === previous, original),
      ).toBe(true);
      await rowBounds(page, login.cow, width, height);
      await login.cow.getByRole('button', { name: messages.en.auth.cowPlay!, exact: true }).click();
      await expect(login.workspace).toHaveAttribute('data-cow-motion', 'active');
      await expect(login.workspace).toHaveAttribute('data-cow-globe-motion', 'paused');
      await expect(login.workspace).toHaveAttribute('data-cow-leaf-motion', 'paused');
      await expect(selected).toHaveAttribute('aria-pressed', 'true');
      expect(requests).toBe(1);
      await original?.dispose();
    });
  });
}

test('active typing denial retains the mouth arm, coding effects and pointer gaze before restoring typing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1503, height: 776 });
  await page.route(signIn, (route) =>
    route.fulfill({ status: 401, json: { detail: 'INVALID_CREDENTIALS' } }),
  );
  const login = await openLogin(page);
  const coding = login.cow.getByRole('button', { name: messages.en.auth.cowCoding!, exact: true });
  await coding.click();
  const original = await login.workspace.elementHandle();
  await fillCredentials(login);
  await login.submit.click();
  await denied(login.cow);
  await expect(login.workspace).toHaveAttribute('data-cow-motion', 'active');
  await expect(login.workspace).toHaveAttribute('data-cow-phase', 'typing');
  await expect(login.cow.locator('[data-cow-arm-pose="mouth-covering"]')).toBeVisible();
  for (const part of ['typing-sweat', 'laptop-typing-light']) {
    const effect = login.cow.locator(`[data-cow-part="${part}"]`);
    await expect(effect).toBeVisible();
    await expect(effect.locator(':scope > g > g').first()).toHaveCSS(
      'animation-play-state',
      'running',
    );
  }
  const pupils = () =>
    login.cow
      .locator('[data-denied-cow-pupil]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')));
  await page.mouse.move(1480, 740);
  await expect.poll(pupils).not.toEqual(['translate(0 0)', 'translate(0 0)']);
  const right = await pupils();
  await page.mouse.move(4, 4);
  await expect.poll(pupils).not.toEqual(right);
  for (const key of ['cowGlobeRotate', 'cowLeavesSway', 'cowMouseFollow'])
    await expect(
      login.cow.getByRole('button', { name: messages.en.auth[key]!, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({
    path: test.info().outputPath('auth-denied-cow-desktop-active.png'),
    fullPage: true,
  });
  await login.password.focus();
  await login.password.press('End');
  await denied(login.cow);
  await login.password.press('Backspace');
  await restored(login.cow);
  await expect(login.workspace).toHaveAttribute('data-cow-motion', 'active');
  await expect(login.workspace).toHaveAttribute('data-cow-phase', 'typing');
  await expect(coding).toHaveAttribute('aria-pressed', 'true');
  expect(
    await login.workspace.evaluate((element, previous) => element === previous, original),
  ).toBe(true);
  await original?.dispose();
});

for (const failure of [
  'network',
  'rate limit',
  'server error',
  'unclassified 401',
  'unclassified 403',
] as const) {
  test(`${failure} retains the normal cow and existing failure notification`, async ({ page }) => {
    await page.route(signIn, (route) =>
      failure === 'network'
        ? route.abort('failed')
        : route.fulfill({
            status:
              failure === 'rate limit'
                ? 429
                : failure === 'server error'
                  ? 500
                  : failure === 'unclassified 401'
                    ? 401
                    : 403,
            json: {
              detail: failure === 'rate limit' ? 'TOO_MANY_SIGN_IN_ATTEMPTS' : 'UNEXPECTED_ERROR',
            },
          }),
    );
    const login = await openLogin(page);
    await fillCredentials(login);
    await login.submit.click();
    await expect(page.locator('[data-notification-kind]')).toBeVisible();
    await restored(login.cow);
    await expect(page).toHaveURL('/en?view=login');
    await expect(login.submit).toBeEnabled();
  });
}

for (const field of ['email', 'password'] as const) {
  test(`a defensive pending ${field} edit cancels sign-in and cannot restore a late denied cow`, async ({
    page,
  }) => {
    let release = () => {};
    let arrived = () => {};
    let finished = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const received = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const completed = new Promise<void>((resolve) => {
      finished = resolve;
    });
    await page.route(signIn, async (route) => {
      arrived();
      await gate;
      try {
        await route.fulfill({ status: 401, json: { detail: 'INVALID_CREDENTIALS' } });
      } finally {
        finished();
      }
    });
    const login = await openLogin(page);
    await fillCredentials(login);
    await login.submit.click();
    await received;
    const input = login[field];
    await expect(input).toHaveAttribute('readonly');
    await input.evaluate(
      (element, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(element, value);
        element.dispatchEvent(
          new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }),
        );
      },
      field === 'email' ? 'other@example.com' : 'another-password',
    );
    await expect(input).not.toHaveAttribute('readonly');
    await expect(login.submit).toBeEnabled();
    release();
    await completed;
    await restored(login.cow);
    await expect(input).toHaveValue(field === 'email' ? 'other@example.com' : 'another-password');
    await expect(page.locator('[data-notification-kind]')).toHaveCount(0);
  });
}

test('retry clears the denied cow while pending and a subsequent rate limit retains the normal cow', async ({
  page,
}) => {
  let requests = 0;
  let release = () => {};
  const retry = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(signIn, async (route) => {
    if (++requests === 1)
      return route.fulfill({ status: 401, json: { detail: 'INVALID_CREDENTIALS' } });
    await retry;
    return route.fulfill({ status: 429, json: { detail: 'TOO_MANY_SIGN_IN_ATTEMPTS' } });
  });
  const login = await openLogin(page);
  await fillCredentials(login);
  await login.submit.click();
  await denied(login.cow);
  await login.submit.click();
  await restored(login.cow);
  await expect(login.submit).toBeDisabled();
  release();
  await expect(login.submit).toBeEnabled();
  await restored(login.cow);
  await expect(page.getByRole('status')).toContainText(messages.en.auth.tooManyAttempts!);
  expect(requests).toBe(2);
});

test('account mode changes restore the original character without redirecting', async ({
  page,
}) => {
  await page.route(signIn, (route) =>
    route.fulfill({ status: 401, json: { detail: 'INVALID_CREDENTIALS' } }),
  );
  const login = await openLogin(page, 'zh-Hant');
  await fillCredentials(login);
  await login.submit.click();
  await denied(login.cow);
  await expect(page.getByRole('status')).toContainText(
    messages['zh-Hant'].auth.invalidCredentials!,
  );
  await login.panel
    .getByRole('group', { name: messages['zh-Hant'].auth.modeLabel!, exact: true })
    .getByRole('button', { name: messages['zh-Hant'].auth.register!, exact: true })
    .click();
  await restored(login.cow);
  await expect(page).toHaveURL('/zh-Hant?view=login');
});

test('the original standalone access-denied preview still uses the shared angry cow and all five controls', async ({
  page,
}) => {
  const response = await page.goto('/en/access-denied');
  expect(response?.status()).toBe(403);
  await expect(page.locator('[data-auth-phase]')).toHaveAttribute('data-auth-phase', 'auth');
  const cow = page.locator('[data-access-denied-cow]');
  await expect(cow).toBeVisible();
  await expect(cow.locator('[data-denied-cow-pupil]')).toHaveCount(2);
  await expect(cow.locator('[data-cow-arm-pose="no-entry"] use')).toHaveAttribute(
    'transform',
    'translate(32 0)',
  );
  await expect(
    page
      .getByRole('group', { name: messages.en.auth.cowPlayback!, exact: true })
      .getByRole('button'),
  ).toHaveCount(5);
  await expect(page.locator('[data-auth-panel], form')).toHaveCount(0);
});
