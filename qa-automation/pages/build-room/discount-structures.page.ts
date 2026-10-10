import { Page, Locator } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';

/**
 * Catalog → Discount Structures (/Catalog/DiscountStructures) — manufacturer/category rate
 * rules applied only during price-file import (never on part screens, never to manual overrides).
 */
export class DiscountStructuresPage extends BuildRoomBasePage {
  readonly heading: Locator;
  readonly newRuleButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Discount Structures' });
    this.newRuleButton = page.getByRole('button', { name: 'New rule' });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${this.baseUrl}/Catalog/DiscountStructures`, { waitUntil: 'domcontentloaded' });
    await this.heading.waitFor({ state: 'visible', timeout: 30000 });
    await this.waitForBuildRoomLoaders();
  }

  async openNewRule(): Promise<void> {
    await this.newRuleButton.click();
  }

  /** The manufacturer name cell of a rule row. */
  ruleRowLink(manufacturerName: string): Locator {
    return this.page
      .locator('.ta-name-cell__title')
      .filter({ hasText: this.exactText(manufacturerName) });
  }

  private ruleRow(manufacturerName: string): Locator {
    return this.page.locator('tr', { has: this.ruleRowLink(manufacturerName) });
  }

  /** e.g. "5% off" or "× 5.00" depending on which form the rule was saved in. */
  ruleRowRateLocator(manufacturerName: string): Locator {
    return this.ruleRow(manufacturerName).first().locator('.ta-discount-rate');
  }

  /** "ACTIVE" or "INACTIVE" — the Is Active toggle's status. */
  ruleRowActiveStatusLocator(manufacturerName: string): Locator {
    return this.ruleRow(manufacturerName).first().locator('.ta-status');
  }
}
