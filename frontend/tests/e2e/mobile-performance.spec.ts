import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { waitForFixtureHydration } from '../fixtures/browser';

declare global {
  interface Window {
    __portfolioPerformance: { lcp: number; cls: number; interaction: number };
  }
}

test.use({
  viewport: { width: 360, height: 800 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

/** Measure a cold production page with 100 records per collection and demand-owned resources.
 * CDP throttling is a repeatable laboratory scenario, not a claim about physical hardware.
 */
test('low-end mobile cold load keeps large portfolios bounded', async ({ page }, info) => {
  test.setTimeout(60_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  let transferred = 0;
  cdp.on('Network.loadingFinished', ({ encodedDataLength }) => {
    transferred += encodedDataLength;
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8,
    connectionType: 'cellular4g',
  });
  await page.addInitScript(() => {
    const metrics = { lcp: 0, cls: 0, interaction: 0 };
    Object.assign(window, { __portfolioPerformance: metrics });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) metrics.cls += shift.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        metrics.interaction = Math.max(metrics.interaction, entry.duration);
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  });
  const reads: URL[] = [];
  const scripts: Promise<{ url: string; raw: number; gzip: number }>[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/portfolio/')) reads.push(new URL(request.url()));
  });
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script' && response.url().includes('/assets/'))
      scripts.push(
        response
          .body()
          .then((body) => ({ url: response.url(), raw: body.length, gzip: gzipSync(body).length })),
      );
  });
  const response = await page.goto('/en/stress#overview');
  expect(response?.status()).toBe(200);
  const html = await response!.body();
  await expect(page.locator('[data-portfolio-user="stress"]')).toBeVisible();
  await waitForFixtureHydration(page);
  await expect(page.locator('[data-portfolio-user="stress"]')).not.toHaveAttribute(
    'data-entering',
    'true',
  );
  const initialScripts = await Promise.all([...scripts]);
  const initialMetrics = await page.evaluate(() => window.__portfolioPerformance);
  const initialHeap = await cdp.send('Runtime.getHeapUsage');
  const initialReadCount = reads.length;
  // The small shared auth-transition controller belongs to the base JS budget; the form stays lazy.
  const heavyChunk = /\/(?:JourneyMap|CowWorkspace|ProjectDetail)-|\/auth-(?!transition-)/;
  const metrics = {
    scenario:
      'Chromium 360×800, cold cache, 6× CPU, 1.6 Mbps download, 150 ms latency, 100 records per collection',
    htmlRawKiB: html.length / 1024,
    initialTransferredKiB: transferred / 1024,
    initialJavaScriptHeapMiB: initialHeap.usedSize / 1024 / 1024,
    initialJavaScriptGzipKiB: initialScripts.reduce((sum, script) => sum + script.gzip, 0) / 1024,
    initialBaseJavaScriptGzipKiB:
      initialScripts
        .filter((script) => !heavyChunk.test(script.url))
        .reduce((sum, script) => sum + script.gzip, 0) / 1024,
    lcpMs: initialMetrics.lcp,
    cls: initialMetrics.cls,
    initialPortfolioRequests: reads.map((url) => url.pathname + url.search),
    initialHeavyChunks: initialScripts
      .filter((script) => heavyChunk.test(script.url))
      .map((script) => script.url),
  };
  await info.attach('mobile-cold-load.json', {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json',
  });
  console.log('Mobile cold load:', JSON.stringify(metrics));
  expect(metrics.htmlRawKiB).toBeLessThanOrEqual(200);
  expect(metrics.initialBaseJavaScriptGzipKiB).toBeLessThanOrEqual(250);
  expect(metrics.cls).toBeLessThanOrEqual(0.1);
  expect(metrics.initialHeavyChunks).toEqual([]);
  expect(reads.some((url) => Number(url.searchParams.get('page') ?? '1') > 1)).toBe(false);
  expect(metrics.lcpMs).toBeGreaterThan(0);
  expect(metrics.lcpMs).toBeLessThanOrEqual(2500);

  // An explicit section navigation activates that section without exhausting 100 categories.
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const navigation = page.getByRole('dialog', { name: 'Main navigation' });
  await expect(navigation).toBeVisible();
  await navigation.getByRole('link', { name: 'Skills', exact: true }).click();
  await expect(page).toHaveURL(/#skills$/);
  await expect(page.locator('[data-category-id]')).toHaveCount(6);
  await page.getByRole('button', { name: 'Show more categories' }).click();
  await expect(page.locator('[data-category-id]')).toHaveCount(12);
  const categoryReads = reads
    .slice(initialReadCount)
    .filter((url) => url.pathname.endsWith('/skill-categories'));
  expect(categoryReads.map((url) => url.searchParams.get('page'))).toContain('2');
  expect(categoryReads.some((url) => Number(url.searchParams.get('page')) > 2)).toBe(false);
  const interaction = await page.evaluate(() => window.__portfolioPerformance.interaction);
  const afterInteractionHeap = await cdp.send('Runtime.getHeapUsage');
  await info.attach('mobile-interaction.json', {
    body: JSON.stringify(
      {
        maximumObservedEventDurationMs: interaction,
        javaScriptHeapAfterInteractionMiB: afterInteractionHeap.usedSize / 1024 / 1024,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  console.log(
    'Mobile interaction:',
    JSON.stringify({
      maximumObservedEventDurationMs: interaction,
      javaScriptHeapAfterInteractionMiB: afterInteractionHeap.usedSize / 1024 / 1024,
    }),
  );
  await cdp.detach();
});
