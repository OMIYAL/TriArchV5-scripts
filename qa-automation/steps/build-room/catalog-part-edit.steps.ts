import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { CatalogPartsPage } from '../../pages/build-room/catalog-parts.page';
import { CatalogPartEditComponent } from '../../pages/build-room/components/catalog-part-edit.component';
import { getScenarioState } from '../../utils/scenario-state';

const { When, Then } = createBdd();

When('the Estimator searches the catalog for {string}', async ({ page }, query: string) => {
  const catalogParts = new CatalogPartsPage(page);
  await catalogParts.search(query);
});

When('the Estimator opens the part named {string}', async ({ page }, name: string) => {
  const catalogParts = new CatalogPartsPage(page);
  await catalogParts.openPartByName(name);
  getScenarioState(page).openedPart = name;
  const editPanel = new CatalogPartEditComponent(page);
  await editPanel.waitForOpen();
});

Then('the Catalog Part Edit panel shows the expected fields', async ({ page }) => {
  const editPanel = new CatalogPartEditComponent(page);
  await editPanel.assertKeyFieldsVisible();
});

When('the Estimator cancels the Catalog Part Edit panel', async ({ page }) => {
  const editPanel = new CatalogPartEditComponent(page);
  await editPanel.cancel();
});

When(
  'the Estimator sets a manual Trade List Price and Net Cost of {string} on the open part',
  async ({ page }, amount: string) => {
    const editPanel = new CatalogPartEditComponent(page);

    // Net Cost is read-only while a vendor is followed, and vendor-prices.feature shares this
    // part, so release the vendor first if needed.
    const followedVendor = await editPanel.getFollowedVendorName();
    if (followedVendor) {
      await editPanel.stopUsingVendor(followedVendor);
      await editPanel.save();
      const partName = getScenarioState(page).openedPart;
      if (!partName) throw new Error('No part was opened in this scenario to reopen.');
      await new CatalogPartsPage(page).searchAndOpenPart(partName);
      await editPanel.waitForOpen();
    }

    await editPanel.ensureManualPricingMode();
    await editPanel.fillTradeListPrice(amount);
    await editPanel.fillNetCost(amount);
  }
);

Then(
  'the Estimator ensures the part {string} with catalog number {string} exists in category {string}',
  async ({ page }, name: string, catalogNumber: string, category: string) => {
    const catalogParts = new CatalogPartsPage(page);

    if (await catalogParts.hasPartRow(name)) {
      console.log(`[catalog-part-edit] Part "${name}" already exists — skipping creation.`);
      return;
    }

    console.log(`[catalog-part-edit] Part "${name}" not found — creating it.`);
    await catalogParts.openNewPart();

    const editPanel = new CatalogPartEditComponent(page);
    await editPanel.waitForOpen();
    await editPanel.fillName(name);
    await editPanel.fillCatalogNumber(catalogNumber);
    await editPanel.selectUnitOfMeasure('EA — Each');
    await editPanel.selectPartCategory(category);
    // Net Cost equal to Trade List Price.
    await editPanel.fillTradeListPrice('42.50');
    await editPanel.fillNetCost('42.50');
    await editPanel.save();

    // Search again to confirm it was saved.
    await catalogParts.search(name);
    await expect(
      catalogParts.partRowLink(name),
      `Part "${name}" (${catalogNumber}) was not in the grid after Save — check the panel for a validation error.`
    ).toBeVisible();
  }
);
