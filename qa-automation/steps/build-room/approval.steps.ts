import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { ApprovalPage } from '../../pages/build-room/approval.page';
import { QuoteReviewPage } from '../../pages/build-room/quote-review.page';
import { getScenarioState } from '../../utils/scenario-state';

const { When, Then } = createBdd();

Then('the Quote review document is shown', async ({ page }) => {
  await expect(new QuoteReviewPage(page).quoteDocumentViewer).toBeVisible();
});

/** The proposal's lines, once the document editor has loaded. */
async function quoteLines(quote: QuoteReviewPage): Promise<string[]> {
  await expect.poll(async () => (await quote.documentLines()).length, { timeout: 30000 }).toBeGreaterThan(0);
  return quote.documentLines();
}

Then('the quote document shows the project name and number', async ({ page }) => {
  const quote = new QuoteReviewPage(page);
  const lines = await quoteLines(quote);
  expect(lines, 'project name').toContain(await quote.projectName());
  expect(lines, 'project number').toContain(await quote.projectNumber());
});

Then("the quote's total price equals the Estimate's bid", async ({ page }) => {
  const quote = new QuoteReviewPage(page);
  const bid = getScenarioState(page).estimateBid;
  if (bid === null) throw new Error("The Estimate's bid was not noted before locking.");
  expect(quote.totalPrice(await quoteLines(quote))).toBe(bid);
});

Then("the quote's itemised amounts add up to its total price", async ({ page }) => {
  const quote = new QuoteReviewPage(page);
  const lines = await quoteLines(quote);
  const amounts = quote.itemisedAmounts(lines);
  expect(amounts.length, 'priced scope lines on the quote').toBeGreaterThan(0);
  expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBeCloseTo(quote.totalPrice(lines), 2);
});

When('the Estimator sends the quote for approval', async ({ page }) => {
  await new QuoteReviewPage(page).sendForApproval();
});

Then('the Approval stage shows {int} of the roster signed', async ({ page }, expectedSigned: number) => {
  await expect(new ApprovalPage(page).signedCountText).toHaveText(new RegExp(`^${expectedSigned} of \\d+ signed`));
});

When('the Estimator signs as the primary account', async ({ page }) => {
  await new ApprovalPage(page).sign();
});

// The last signature moves the app to the Submit page on its own, so assert that page itself.
// A negative-only check on the Submit step's class could pass without the element being there.
Then('the bid advances to Submit', async ({ page }) => {
  const approval = new ApprovalPage(page);
  const submitStep = approval.stageStep('submit');
  await approval.waitForStage('submit', 60000);
  await expect(page.getByText('Ready to submit')).toBeVisible({ timeout: 30000 });
  await expect(submitStep).toBeVisible();
  await expect(submitStep).not.toHaveClass(/is-locked/);
});
