import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { EstimatePage } from '../../pages/build-room/estimate.page';
import { getScenarioState } from '../../utils/scenario-state';

const { When, Then } = createBdd();

Then(
  "the Estimate's cost stack shows a {string} material line and a non-zero Direct cost",
  async ({ page }, partName: string) => {
    const estimate = new EstimatePage(page);
    await expect(estimate.materialLineRow(partName)).toContainText('Take-off');
    await expect(estimate.directCostRow).not.toContainText('$0.00');
  }
);

When('the Estimator sets Overhead to {int} percent', async ({ page }, pct: number) => {
  await new EstimatePage(page).setOverheadPct(String(pct));
});

When('the Estimator sets Contingency to {int} percent', async ({ page }, pct: number) => {
  await new EstimatePage(page).setContingencyPct(String(pct));
});

When(
  'the Estimator adds a {string} cost line of {float} percent with notes {string}',
  async ({ page }, categoryName: string, pct: number, notes: string) => {
    const estimate = new EstimatePage(page);
    getScenarioState(page).directCostBeforeLine = await estimate.directCostAmount();
    await estimate.openAddCostLine();
    await estimate.selectCostCategory(categoryName);
    await estimate.fillCostLineValue(String(pct));
    await estimate.fillCostLineNotes(notes);
    // Wait for a real computed amount, not the panel's placeholder or validation text.
    await expect(estimate.costLinePreviewText()).toHaveText(/×.*=\s*\$/, { timeout: 15000 });
    await estimate.submitCostLine();
  }
);

// The ladder updates a few seconds after the line is saved, so wait for it before reading the bid.
Then("the Estimate's direct cost reflects the added cost line", async ({ page }) => {
  const before = getScenarioState(page).directCostBeforeLine;
  if (before === null) throw new Error('The direct cost was not noted before adding the cost line.');
  const estimate = new EstimatePage(page);
  await expect.poll(() => estimate.directCostAmount(), { timeout: 30000 }).toBeGreaterThan(before);
});

// Noted before locking so the quote's total can be compared with it later.
Then('the Estimate shows a bid price', async ({ page }) => {
  const bid = await new EstimatePage(page).bidAmount();
  expect(bid).toBeGreaterThan(0);
  getScenarioState(page).estimateBid = bid;
});

When('the Estimator locks the estimate', async ({ page }) => {
  await new EstimatePage(page).lockEstimate();
});
