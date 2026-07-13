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
    await this.emailInput.fill((process.env.STRIPE_TEST_EMAIL || 'test@test.com'));
    await this.cardNumberInput.fill((process.env.STRIPE_TEST_CARD_NUMBER || ''));
    await this.expirationInput.fill((process.env.STRIPE_TEST_EXPIRATION || ''));
    await this.cvcInput.fill((process.env.STRIPE_TEST_CVC || ''));
    await this.cardholderNameInput.fill((process.env.STRIPE_TEST_CARDHOLDER_NAME || ''));
    await this.countrySelect.selectOption('US');
    await this.zipInput.fill((process.env.STRIPE_TEST_ZIP || ''));
    await this.submitButton.click();
  }
}
