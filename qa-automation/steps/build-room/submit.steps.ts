import { createBdd } from 'playwright-bdd';
import { expect, test } from '@playwright/test';
import { SubmitPage } from '../../pages/build-room/submit.page';

const { When, Then } = createBdd();

When('the Estimator ticks every contractor attestation', async ({ page }) => {
  await new SubmitPage(page).tickAllAttestations();
});

When('the Estimator submits the bid', async ({ page }) => {
  await new SubmitPage(page).submitBid();
});

Then('the bid shows as submitted', async ({ page }) => {
  await page.waitForLoadState('load');
  await page.reload({ waitUntil: 'load' });
  await expect(new SubmitPage(page).bidSubmittedBanner).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/awaiting award/i)).toBeVisible({ timeout: 30000 });
  await test.info().attach('submit-final', { body: await page.screenshot(), contentType: 'image/png' });
});
