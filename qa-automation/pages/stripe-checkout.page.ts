import { Page, Locator } from '@playwright/test';
import { env } from '../utils/env.helper';

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
    await this.emailInput.fill(env.stripe.email);
    await this.cardNumberInput.fill(env.stripe.cardNumber);
    await this.expirationInput.fill(env.stripe.expiration);
    await this.cvcInput.fill(env.stripe.cvc);
    await this.cardholderNameInput.fill(env.stripe.cardholderName);
    await this.countrySelect.selectOption('US');
    await this.zipInput.fill(env.stripe.zip);
    await this.submitButton.click();
  }
}