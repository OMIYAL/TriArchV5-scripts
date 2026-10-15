import { createBdd } from 'playwright-bdd';
import { BomReviewPage } from '../../pages/build-room/bom-review.page';
import { TakeOffPage } from '../../pages/build-room/take-off.page';
const { When } = createBdd();

When('the Estimator generates the BOM', async ({ page }) => {
  await new TakeOffPage(page).generateBom();
});
When('the Estimator approves the BOM', async ({ page }) => {
  await new BomReviewPage(page).approveBom();
});