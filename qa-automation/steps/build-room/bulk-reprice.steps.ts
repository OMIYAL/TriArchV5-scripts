import { createBdd } from 'playwright-bdd';
import { expect, Page } from '@playwright/test';
import { CatalogPartsPage } from '../../pages/build-room/catalog-parts.page';
import { BulkRepriceComponent } from '../../pages/build-room/components/bulk-reprice.component';

const { When, Then } = createBdd();

/** The part count the preview reported at the first scope, to compare against after rescoping. */
const firstPreviewCount = new WeakMap<Page, number>();

When('the Estimator opens Parts & Assemblies', async ({ page }) => {
  const catalogParts = new CatalogPartsPage(page);
  await catalogParts.goto();
});

When('the Estimator opens the Bulk Reprice panel', async ({ page }) => {
  const catalogParts = new CatalogPartsPage(page);
  const bulkReprice = new BulkRepriceComponent(page);
  await catalogParts.openBulkReprice();
  await bulkReprice.waitForOpen();
});

Then('the Bulk Reprice panel shows the rate toggle and rate input', async ({ page }) => {
  const bulkReprice = new BulkRepriceComponent(page);
  await bulkReprice.assertDefaultControlsVisible();
});

When('the Estimator cancels the Bulk Reprice panel', async ({ page }) => {
  const bulkReprice = new BulkRepriceComponent(page);
  await bulkReprice.cancel();
});

Then('the Bulk Reprice panel is closed', async ({ page }) => {
  const bulkReprice = new BulkRepriceComponent(page);
  await expect(bulkReprice.heading).toBeHidden();
});

When(
  'the Estimator scopes the batch to category {string} at {int} percent off list',
  async ({ page }, category: string, rate: number) => {
    const bulkReprice = new BulkRepriceComponent(page);
    await bulkReprice.selectCategory(category);
    await bulkReprice.setRate(String(rate));
  }
);

When(
  'the Estimator scopes the batch to manufacturer {string} at {int} percent off list',
  async ({ page }, manufacturer: string, rate: number) => {
    const bulkReprice = new BulkRepriceComponent(page);
    await bulkReprice.selectManufacturer(manufacturer);
    await bulkReprice.setRate(String(rate));
    // A rate already applied by an earlier run previews 0 parts, so raise it until a batch shows.
    let currentRate = rate;
    for (let attempt = 0; attempt < 5; attempt++) {
      const text = await bulkReprice.waitForPreview();
      const match = text.match(/Would update (\d+) parts/i);
      if (match && parseInt(match[1], 10) > 0) break;
      currentRate += 1;
      await bulkReprice.setRate(String(currentRate));
    }
  }
);

When('the Estimator queues the Bulk Reprice batch', async ({ page }) => {
  const bulkReprice = new BulkRepriceComponent(page);
  await bulkReprice.queueBatch();
});

Then('the catalog grid shows {string} parts priced with today\'s FILE date', async ({ page }, manufacturerQuery: string) => {
  const catalogParts = new CatalogPartsPage(page);
  await catalogParts.goto();
  await catalogParts.search(manufacturerQuery);
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const badges = catalogParts.allGridRowPriceSourceLocators();
  await badges.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  const count = await badges.count();
  expect(count, `Expected at least one "${manufacturerQuery}" row in the grid after queuing the batch`).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(badges.nth(i)).toContainText(`FILE · ${today}`);
  }
});

Then(
  'the Bulk Reprice preview reports how many parts would update and that manual overrides are protected',
  async ({ page }) => {
    const bulkReprice = new BulkRepriceComponent(page);
    const text = await bulkReprice.waitForPreview();
    expect(text).toMatch(/Would update \d+ parts/i);
    expect(text).toMatch(/manual overrides? skipped \(protected\)/i);
    console.log(`[bulk-reprice] Preview: ${text.trim()}`);
  }
);

Then('the Bulk Reprice preview reports how many parts would update', async ({ page }) => {
  const bulkReprice = new BulkRepriceComponent(page);
  const text = await bulkReprice.waitForPreview();
  const match = text.match(/Would update (\d+) parts/i);
  expect(match, `Preview text didn't match the expected "Would update N parts" pattern: "${text}"`).not.toBeNull();
  firstPreviewCount.set(page, parseInt(match![1], 10));
  console.log(`[bulk-reprice] Preview at first scope: ${text.trim()}`);
});

When('the Estimator rescopes the batch to category {string}', async ({ page }, category: string) => {
  const bulkReprice = new BulkRepriceComponent(page);
  await bulkReprice.selectCategory(category);
});

Then('the Bulk Reprice preview reports a different part count than before', async ({ page }) => {
  const bulkReprice = new BulkRepriceComponent(page);
  const previousCount = firstPreviewCount.get(page);
  if (previousCount === undefined) throw new Error('No earlier preview count was recorded for this scenario.');
  // Wait for the old count to go away so a stale preview isn't read.
  await expect(bulkReprice.previewText).not.toHaveText(new RegExp(`Would update ${previousCount} parts\\b`), {
    timeout: 15000,
  });
  const text = await bulkReprice.waitForPreview();
  const match = text.match(/Would update (\d+) parts/i);
  expect(match, `Preview text didn't match the expected "Would update N parts" pattern: "${text}"`).not.toBeNull();
  const newCount = parseInt(match![1], 10);
  expect(
    newCount,
    `Expected the preview count to change after switching category scope, but it stayed at ${previousCount} for both — this would mean the preview isn't actually re-computing from real scope data.`
  ).not.toBe(previousCount);
  console.log(`[bulk-reprice] Preview at second scope: ${text.trim()}`);
});
