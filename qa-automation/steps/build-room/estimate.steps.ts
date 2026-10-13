import { createBdd } from 'playwright-bdd';
import { EstimatePage } from '../../pages/build-room/estimate.page';

const { When } = createBdd();

When('the Estimator locks the estimate', async ({ page }) => {
  await new EstimatePage(page).lockEstimate();
});
