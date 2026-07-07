import { Page } from '@playwright/test';
import { StripeCheckoutPage } from '../../pages/stripe-checkout.page';

export async function payIntakeFeeViaStripeIfRequired(page: Page): Promise<void> {
  await page.waitForTimeout(2000);

  const payButton = page.getByRole('button', { name: /Pay intake fee/i });
  const isPaymentRequired = await payButton.isVisible({ timeout: 3000 }).catch(() => false);

  if (!isPaymentRequired) {
    return;
  }

  const popupPromise = page.waitForEvent('popup', { timeout: 10_000 });
  await payButton.click();

  let stripePage: Page;
  try {
    stripePage = await popupPromise;
  } catch {
    const currentUrl = page.url();
    if (currentUrl.includes('stripe.com')) {
      stripePage = page;
    } else {
      return;
    }
  }

  const stripeCheckout = new StripeCheckoutPage(stripePage);
  await stripeCheckout.completePayment();

  await page.waitForURL(/storefront/, { timeout: 30_000 }).catch(() => {});
}

