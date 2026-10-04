import { createBdd } from 'playwright-bdd';
import { expect, Page } from '@playwright/test';
import { CatalogPartsPage } from '../../pages/build-room/catalog-parts.page';
import { CatalogPartEditComponent } from '../../pages/build-room/components/catalog-part-edit.component';
import { getScenarioState } from '../../utils/scenario-state';

/** Reopens the part this scenario opened in its Background; saving closes the panel. */
async function reopenPart(page: Page): Promise<void> {
  const partName = getScenarioState(page).openedPart;
  if (!partName) throw new Error('No part was opened in this scenario to reopen.');
  await new CatalogPartsPage(page).searchAndOpenPart(partName);
  await new CatalogPartEditComponent(page).waitForOpen();
}

const { Given, When, Then } = createBdd();

/** Makes the "stop using" scenario independent of whether the "use" scenario ran first. */
Given(
  'the part already follows the {string} vendor price at {string} with quote {string} expiring {string}',
  async ({ page }, vendorName: string, price: string, quoteNo: string, expires: string) => {
    const editPanel = new CatalogPartEditComponent(page);

    if (await editPanel.isFollowingVendor(vendorName)) {
      return;
    }

    if (!(await editPanel.hasVendorRow(vendorName))) {
      await editPanel.addVendorPrice(vendorName);
      await editPanel.fillVendorPrice(vendorName, price);
      await editPanel.fillVendorQuoteNo(vendorName, quoteNo);
      await editPanel.fillVendorExpires(vendorName, expires);
    }
    await editPanel.useVendorPrice(vendorName);
    await editPanel.save();

    await reopenPart(page); // the scenario's own steps need the panel open
  }
);

When(
  'the Estimator adds a vendor price from {string} of {string} with quote {string} expiring {string}',
  async ({ page }, vendorName: string, price: string, quoteNo: string, expires: string) => {
    const editPanel = new CatalogPartEditComponent(page);

    // Remove a row left by an earlier run; the vendor picker doesn't offer vendors already listed.
    if (await editPanel.hasVendorRow(vendorName)) {
      await editPanel.removeVendorRow(vendorName);
      await editPanel.save();
      await reopenPart(page);
    }

    await editPanel.addVendorPrice(vendorName);
    await editPanel.fillVendorPrice(vendorName, price);
    await editPanel.fillVendorQuoteNo(vendorName, quoteNo);
    await editPanel.fillVendorExpires(vendorName, expires);
  }
);

When('the Estimator uses the {string} vendor price', async ({ page }, vendorName: string) => {
  const editPanel = new CatalogPartEditComponent(page);
  await editPanel.useVendorPrice(vendorName);
});

When('the Estimator stops using the {string} vendor price', async ({ page }, vendorName: string) => {
  const editPanel = new CatalogPartEditComponent(page);
  await editPanel.stopUsingVendor(vendorName);
});

When('the Estimator saves the Catalog Part Edit panel', async ({ page }) => {
  const editPanel = new CatalogPartEditComponent(page);
  await editPanel.save();
});

Then(
  'the grid shows {string} priced at {string} and following {string}',
  async ({ page }, partName: string, price: string, source: string) => {
    const catalogParts = new CatalogPartsPage(page);
    // The grid reloads after Save, so allow longer than the default.
    await expect(catalogParts.gridRowPriceLocator(partName)).toHaveText(price, { timeout: 15000 });
    await expect(catalogParts.gridRowPriceSourceLocator(partName)).toHaveText(new RegExp(`^${source}\\b`), {
      timeout: 15000,
    });
  }
);
