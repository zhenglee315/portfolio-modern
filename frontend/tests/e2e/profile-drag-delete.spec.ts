import { expect, type Locator, type Page } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';
import { openEditor, save } from '../fixtures/profile-editor';

const lists = [
  { section: 'experience', row: 'data-experience-editor-row' },
  { section: 'projects', row: 'data-project-editor-row' },
] as const;

/** Touch the target with the card's far edge while the pointer stays beside its original grip. */
async function deletionPoints(handle: Locator, card: Locator, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await handle.scrollIntoViewIfNeeded();
  const grip = (await handle.boundingBox())!;
  const source = (await card.boundingBox())!;
  const bounds = (await target.boundingBox())!;
  const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  return {
    from,
    to: { x: from.x, y: bounds.y + bounds.height - 2 + from.y - source.y },
  };
}

async function startDrag(page: Page, points: Awaited<ReturnType<typeof deletionPoints>>) {
  await page.mouse.move(points.from.x, points.from.y);
  await page.mouse.down();
  await page.mouse.move(points.to.x, points.to.y, { steps: 12 });
}

for (const list of lists) {
  for (const width of [390, 1600]) {
    test(`${list.section} drag-to-delete highlights the whole-card contact and preserves other selections at ${width}px`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1100 });
      const writes: unknown[] = [];
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.endsWith('/portfolio/site/save'))
          writes.push(request.postDataJSON());
      });
      await openEditor(page, `/en/profile?section=${list.section}`, 'mist', {
        existingApi: true,
      });
      const rows = page.locator(`[data-reorder-list] [${list.row}]`);
      const first = rows.first();
      const firstId = await first.getAttribute(list.row);
      const secondId = await rows.nth(1).getAttribute(list.row);
      const handle = first.getByRole('button', { name: /^Drag .* to reorder$/ });
      const target = page.getByRole('button', { name: 'Delete selected', exact: true });
      const submit = page.getByRole('button', { name: 'Save changes', exact: true });
      const ghost = page.locator('[data-reorder-ghost]');
      const points = await deletionPoints(handle, first, target);
      expect(points.to.x).toBeLessThan((await target.boundingBox())!.x);
      await expect(target).toBeDisabled();
      await startDrag(page, points);
      await expect(target).toBeEnabled();
      await expect(target).toHaveAttribute('data-delete-drop-over', 'true');
      await expect(ghost).toHaveAttribute('data-delete-target', 'true');
      await expect
        .poll(() =>
          target.evaluate(
            (node) => getComputedStyle(node).backgroundColor === getComputedStyle(node).borderColor,
          ),
        )
        .toBe(true);
      // The red target remains visible above the full-card preview, even where they overlap.
      expect(
        await target.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return node.contains(document.elementFromPoint(rect.right - 3, rect.bottom - 3));
        }),
      ).toBe(true);
      await page.screenshot({ path: info.outputPath('drag-delete-highlight.png') });
      await page.mouse.move(points.to.x, points.to.y + 20, { steps: 12 });
      await expect(target).not.toHaveAttribute('data-delete-drop-over');
      await page.mouse.move(points.to.x, points.to.y, { steps: 12 });
      await expect(target).toHaveAttribute('data-delete-drop-over', 'true');
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(ghost).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(target).toBeDisabled();
      await expect(submit).toBeDisabled();

      await startDrag(page, points);
      await page.mouse.up();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText(
        `1 selected ${list.section === 'experience' ? 'experience(s)' : 'project(s)'}`,
      );
      await dialog.getByRole('button', { name: 'Keep editing', exact: true }).last().click();
      await expect(rows.first()).toHaveAttribute(list.row, firstId!);
      await expect(submit).toBeDisabled();
      await first.getByRole('checkbox').check();
      await rows.nth(1).getByRole('checkbox').check();
      await startDrag(page, await deletionPoints(handle, first, target));
      await expect(target).toHaveAttribute('data-delete-drop-over', 'true');
      await page.mouse.up();
      await expect(dialog).toContainText(
        `1 selected ${list.section === 'experience' ? 'experience(s)' : 'project(s)'}`,
      );
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.locator(`[data-reorder-list] [${list.row}="${firstId}"]`)).toHaveCount(0);
      await expect(rows.first()).toHaveAttribute(list.row, secondId!);
      await expect(rows.first().getByRole('checkbox')).toBeChecked();
      await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
      expect(writes).toHaveLength(0);
      await save(page);
      expect(writes).toHaveLength(1);
      await page.reload();
      await expect(rows.first()).toHaveAttribute(list.row, secondId!);
    });
  }

  test(`${list.section} denies drag deletion when delete permission is absent`, async ({
    page,
  }) => {
    await openEditor(page, `/en/profile?section=${list.section}`, 'mint', {
      existingApi: true,
      permissions: { is_delete: false },
    });
    const first = page.locator(`[data-reorder-list] [${list.row}]`).first();
    const originalId = await first.getAttribute(list.row);
    const target = page.getByRole('button', { name: 'Delete selected', exact: true });
    const handle = first.getByRole('button', { name: /^Drag .* to reorder$/ });
    await expect(handle).toBeEnabled();
    await startDrag(page, await deletionPoints(handle, first, target));
    await expect(page.locator('[data-reorder-ghost]')).toBeVisible();
    await expect(target).toBeDisabled();
    await expect(target).not.toHaveAttribute('data-delete-drop-over');
    await page.mouse.up();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(first).toHaveAttribute(list.row, originalId!);
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  });
  test(`${list.section} can drag a lower card back to the initially offscreen delete target`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openEditor(page, `/en/profile?section=${list.section}`, 'mist', { existingApi: true });
    const rows = page.locator(`[data-reorder-list] [${list.row}]`);
    const last = rows.last();
    const originalId = await last.getAttribute(list.row);
    const handle = last.getByRole('button', { name: /^Drag .* to reorder$/ });
    const target = page.getByRole('button', { name: 'Delete selected', exact: true });
    await handle.scrollIntoViewIfNeeded();
    expect((await target.boundingBox())!.y).toBeLessThan(0);
    const grip = (await handle.boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, 30, { steps: 12 });
    await expect(target).toHaveAttribute('data-delete-drop-over', 'true');
    // Releasing after auto-scroll confirms deletion rather than committing intermediate sort slots.
    await page.mouse.up();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Keep editing', exact: true }).last().click();
    await expect(rows.last()).toHaveAttribute(list.row, originalId!);
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  });
}

test.describe('touch drag deletion', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 1100 } });
  for (const list of lists) {
    test(`${list.section} touch cancellation resets the red target and release confirms one card`, async ({
      page,
    }) => {
      await openEditor(page, `/en/profile?section=${list.section}`, 'mist', { existingApi: true });
      const first = page.locator(`[data-reorder-list] [${list.row}]`).first();
      const handle = first.getByRole('button', { name: /^Drag .* to reorder$/ });
      const target = page.getByRole('button', { name: 'Delete selected', exact: true });
      const cdp = await page.context().newCDPSession(page);
      const points = await deletionPoints(handle, first, target);
      for (const end of ['touchCancel', 'touchEnd'] as const) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [points.from],
        });
        for (let step = 1; step <= 12; step++)
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
              { x: points.from.x, y: points.from.y + ((points.to.y - points.from.y) * step) / 12 },
            ],
          });
        await expect(target).toHaveAttribute('data-delete-drop-over', 'true');
        await cdp.send('Input.dispatchTouchEvent', { type: end, touchPoints: [] });
        await expect(page.locator('[data-reorder-ghost]')).toHaveCount(0);
        await expect(target).not.toHaveAttribute('data-delete-drop-over');
        if (end === 'touchCancel') {
          await expect(page.getByRole('dialog')).toHaveCount(0);
          await expect(
            page.getByRole('button', { name: 'Save changes', exact: true }),
          ).toBeDisabled();
        } else {
          await expect(page.getByRole('dialog')).toBeVisible();
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Keep editing', exact: true })
            .last()
            .click();
          await expect(
            page.getByRole('button', { name: 'Save changes', exact: true }),
          ).toBeDisabled();
        }
      }
    });
  }
});
