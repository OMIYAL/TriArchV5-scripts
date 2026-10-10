import { Page, Locator, expect } from '@playwright/test';
import { BuildRoomBasePage } from '../base.page';

/**
 * The "Bulk reprice" slide-over on the Parts & Assemblies grid. Its preview text says what a queued
 * batch would change. `queueBatch()` reprices every part in the chosen scope.
 */
export class BulkRepriceComponent extends BuildRoomBasePage {
  readonly dialog: Locator;
  readonly heading: Locator;
  readonly manufacturerSelectTrigger: Locator;
  readonly percentOffToggle: Locator;
  readonly multiplierToggle: Locator;
  readonly rateInput: Locator;
  readonly previewText: Locator;
  readonly cancelButton: Locator;
  readonly queueButton: Locator;

  constructor(page: Page) {
    super(page);
    this.dialog = page.locator('#BulkRepricePanel');
    this.heading = this.dialog.locator('h5', { hasText: 'Bulk reprice' });
    this.manufacturerSelectTrigger = this.customSelectTrigger('BulkManufacturer');
    this.percentOffToggle = this.dialog.locator('[data-bulk-mode="percent"]');
    this.multiplierToggle = this.dialog.locator('[data-bulk-mode="multiplier"]');
    this.rateInput = this.dialog.locator('#BulkValue');
    this.previewText = this.dialog.locator('#BulkPreview');
    this.cancelButton = this.dialog.locator('button', { hasText: 'Cancel' });
    this.queueButton = this.dialog.locator('#BulkRepriceApplyButton');
  }

  async waitForOpen(): Promise<void> {
    await this.dialog.waitFor({ state: 'visible', timeout: 30000 });
  }

  async assertDefaultControlsVisible(): Promise<void> {
    await expect(this.percentOffToggle).toBeVisible();
    await expect(this.multiplierToggle).toBeVisible();
    await expect(this.rateInput).toBeVisible();
    await expect(this.queueButton).toBeVisible();
  }

  async selectManufacturer(manufacturerLabel: string): Promise<void> {
    await this.selectCustomSelectOption('BulkManufacturer', manufacturerLabel);
  }

  /** Goes through the custom-select helper: the native `<select>` is hidden. */
  async selectCategory(categoryLabel: string): Promise<void> {
    await this.selectCustomSelectOption('BulkCategory', categoryLabel);
  }

  async setRate(rate: string): Promise<void> {
    await this.rateInput.fill(rate);
  }

  /** The preview loads from the server, so wait for its real text. */
  async waitForPreview(): Promise<string> {
    await expect(this.previewText).toHaveText(/Would update \d+ parts/i, { timeout: 15000 });
    return (await this.previewText.textContent()) || '';
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.heading.waitFor({ state: 'hidden', timeout: 10000 });
  }

  /** Clicks "Queue reprice batch" and confirms. Applies to every part in the current scope. */
  async queueBatch(): Promise<void> {
    await this.queueButton.click();
    await this.confirmYes();
    await this.page.locator('text=Bulk reprice applied.').waitFor({ state: 'visible', timeout: 15000 });
  }
}
