import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { BomReviewPage } from '../../pages/build-room/bom-review.page';
import { TakeOffPage } from '../../pages/build-room/take-off.page';

const { When, Then } = createBdd();

When('the Estimator generates the BOM', async ({ page }) => {
  await new TakeOffPage(page).generateBom();
});

Then('the BOM shows a {string} line sourced from Take-off', async ({ page }, partName: string) => {
  const bomReview = new BomReviewPage(page);
  await expect(bomReview.bomLineRow(partName)).toContainText('Take-off');
  await expect(bomReview.provenanceRow(partName)).toContainText('counted');
});

When('the Estimator approves the BOM', async ({ page }) => {
  await new BomReviewPage(page).approveBom();
});
