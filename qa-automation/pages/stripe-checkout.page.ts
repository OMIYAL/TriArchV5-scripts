import { Page, Locator } from '@playwright/test';

export class StripeCheckoutPage {
  private readonly page: Page;
  
  private readonly emailInput: Locator;
  private readonly cardNumberInput: Locator;
  private readonly expirationInput: Locator;
  private readonly cvcInput: Locator;
  private readonly cardholderNameInput: Locator;
  private readonly countrySelect: Locator;
  private readonly zipInput: Locator;
  private readonly saveInfoCheckbox: Locator;
  private readonly phoneInput: Locator;
  private readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.emailInput = page.getByRole('textbox', { name: 'Email' });
    this.cardNumberInput = page.getByRole('textbox', { name: 'Card number' });
    this.expirationInput = page.getByRole('textbox', { name: 'Expiration' });
    this.cvcInput = page.getByRole('textbox', { name: 'CVC' });
    this.cardholderNameInput = page.getByRole('textbox', { name: 'Cardholder name' });
    this.countrySelect = page.getByLabel('Country or region');
    this.zipInput = page.getByRole('textbox', { name: 'ZIP' });
    this.saveInfoCheckbox = page.getByRole('checkbox', { name: /save my info/i }).first();
    this.phoneInput = page.getByRole('textbox', { name: /phone/i }).first();
    this.submitButton = page.getByTestId('hosted-payment-submit-button');
  }

  async completePayment(): Promise<void> {
    await this.emailInput.fill((process.env.STRIPE_TEST_EMAIL || 'test@test.com'));
    await this.cardNumberInput.fill((process.env.STRIPE_TEST_CARD_NUMBER || ''));
    await this.expirationInput.fill((process.env.STRIPE_TEST_EXPIRATION || ''));
    await this.cvcInput.fill((process.env.STRIPE_TEST_CVC || ''));
    await this.cardholderNameInput.fill((process.env.STRIPE_TEST_CARDHOLDER_NAME || ''));
    await this.countrySelect.selectOption('US');
    await this.zipInput.fill((process.env.STRIPE_TEST_ZIP || ''));
    await this.declineLinkSignup();
    await this.submitButton.click();
  }

  // Stripe sometimes renders the Link opt-in ("Save my information for faster
  // checkout") pre-checked, which reveals a *required* Phone number field.
  // Left empty, the Pay click fails client-side validation and never redirects.
  // Whether the opt-in shows up at all depends on the session/region, hence the
  // visibility guard: it appears on the US-IP CI runners but not always locally.
  private async declineLinkSignup(): Promise<void> {
    const optInVisible = await this.saveInfoCheckbox
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (optInVisible && await this.saveInfoCheckbox.isChecked()) {
      await this.saveInfoCheckbox.uncheck();
    }

    // Belt and braces: some variants keep asking for a phone number even with
    // the opt-in off. Fill it rather than fail — Stripe test mode accepts any
    // well-formed number.
    if (await this.phoneInput.isVisible().catch(() => false)) {
      await this.phoneInput.fill((process.env.STRIPE_TEST_PHONE || '2015550123'));
    }
  }
}
