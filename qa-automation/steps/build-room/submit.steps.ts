import { createBdd } from 'playwright-bdd';
import { expect, test } from '@playwright/test';
import { SubmitPage } from '../../pages/build-room/submit.page';

const { When, Then } = createBdd();

When('the Estimator ticks every contractor attestation', async ({ page }) => {
  await new SubmitPage(page).tickAllAttestations();
});

Then('the Submit checklist is complete', async ({ page }) => {
  const submit = new SubmitPage(page);
  const total = await submit.attestationBoxes().count();
  await expect(submit.checklistProgress()).toHaveText(`${total}/${total}`);
  await expect(submit.submitBidButton).toBeEnabled();
});

// A real submit: locks the bid PDF, files the attestations and starts the bid tracker.
When('the Estimator submits the bid', async ({ page }) => {
  await new SubmitPage(page).submitBid();
});

// The "Bid submitted." toast shows before the page has finished, so reload and check the saved
// state: a toast alone doesn't prove the bid was kept. The screenshot of that saved page is
// attached to the report.
Then('the bid shows as submitted', async ({ page }) => {
  await page.waitForLoadState('load');
  await page.reload({ waitUntil: 'load' });
  await expect(new SubmitPage(page).bidSubmittedBanner).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/awaiting award/i)).toBeVisible({ timeout: 30000 });
  await test.info().attach('submit-final', { body: await page.screenshot(), contentType: 'image/png' });
});
