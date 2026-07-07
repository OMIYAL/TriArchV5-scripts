import { When } from '../support/fixtures';
import { payIntakeFeeViaStripeIfRequired } from '../../flows/storefront/payment.flow';

When('the citizen completes the intake fee payment via Stripe if required', async ({ page }) => {
  await payIntakeFeeViaStripeIfRequired(page);
});

