import { Page, Locator } from '@playwright/test';
import { guideClick, guideType } from '../utils/mimik-action.helper';
import { drainMimikCapture } from '../utils/mimik.helper';

/** Stripe hosted checkout — use guide helpers so Mimik records payment steps. */
export class StripeCheckoutPage {
  private readonly page: Page;
  private readonly emailInput: Locator;
  private readonly cardNumberInput: Locator;
  private readonly expirationInput: Locator;
  private readonly cvcInput: Locator;
  private readonly cardholderNameInput: Locator;
  private readonly countrySelect: Locator;
  private readonly zipInput: Locator;
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
    this.submitButton = page.getByTestId('hosted-payment-submit-button');
  }

  async completePayment(): Promise<void> {
    await this.cardNumberInput.waitFor({ state: 'visible' });
    await drainMimikCapture(this.page);
    await guideType(this.page, this.emailInput, process.env.STRIPE_TEST_EMAIL || 'test@test.com');
    await guideType(this.page, this.cardNumberInput, process.env.STRIPE_TEST_CARD_NUMBER || '');
    await guideType(this.page, this.expirationInput, process.env.STRIPE_TEST_EXPIRATION || '');
    await guideType(this.page, this.cvcInput, process.env.STRIPE_TEST_CVC || '');
    await guideType(this.page, this.cardholderNameInput, process.env.STRIPE_TEST_CARDHOLDER_NAME || '');
    await this.countrySelect.selectOption('US');
    await guideType(this.page, this.zipInput, process.env.STRIPE_TEST_ZIP || '');
    await guideClick(this.page, this.submitButton);
  }
}