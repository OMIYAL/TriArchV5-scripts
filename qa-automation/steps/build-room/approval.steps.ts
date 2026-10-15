import { createBdd } from 'playwright-bdd';
import { ApprovalPage } from '../../pages/build-room/approval.page';
import { QuoteReviewPage } from '../../pages/build-room/quote-review.page';

const { When } = createBdd();

When('the Estimator sends the quote for approval', async ({ page }) => {
  await new QuoteReviewPage(page).sendForApproval();
});

When('the Estimator signs as the primary account', async ({ page }) => {
  await new ApprovalPage(page).sign();
});
