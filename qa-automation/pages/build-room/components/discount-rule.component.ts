import { Page, Locator, expect } from '@playwright/test';
import { BuildRoomBasePage } from '../base.page';

/**
 * The "Discount rule" slide-over on Discount Structures (create).
 *
 * The rate toggle defaults to "Multiplier", not "% off list": call `choosePercentOffMode()` before
 * `fillValue()`, or a "5" saves as a 5x price increase. The input is swapped per mode and cleared
 * on switching, so set the mode first.
 *
 * Effective To is a daterangepicker whose input has a random per-load `name` — it is found by its
 * `<label>` text instead.
 */
export class DiscountRuleComponent extends BuildRoomBasePage {
  readonly dialog: Locator;
  readonly manufacturerScopeTrigger: Locator;
  readonly partCategoryTrigger: Locator;
  readonly percentOffToggle: Locator;
  readonly multiplierToggle: Locator;
  readonly valueInput: Locator;
  readonly isActiveCheckbox: Locator;
  readonly previewText: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.dialog = page.locator('#DiscountStructureCreatePanel');
    this.manufacturerScopeTrigger = this.customSelectTrigger('DiscountStructure_Manufacturer');
    this.partCategoryTrigger = this.customSelectTrigger('DiscountStructure_CategoryPartId');
    this.percentOffToggle = this.dialog.locator('[data-rate-mode="percent"]');
    this.multiplierToggle = this.dialog.locator('[data-rate-mode="multiplier"]');
    this.valueInput = this.dialog.locator('[data-rate-field]:not(.d-none) input[type="number"]');
    this.isActiveCheckbox = this.dialog.locator('#DiscountStructure_IsActive');
    this.previewText = this.dialog.locator('#DiscountImpactPreview');
    // Unanchored substring match — the button's real textContent has leading whitespace/newline
    // from its icon+label layout, so an anchored `^Save rule$` regex never matches.
    this.saveButton = this.dialog.locator('button', { hasText: 'Save rule' });
  }

  async waitForOpen(): Promise<void> {
    await this.dialog.waitFor({ state: 'visible', timeout: 30000 });
  }

  async assertDefaultControlsVisible(): Promise<void> {
    await expect(this.manufacturerScopeTrigger).toBeVisible();
    await expect(this.partCategoryTrigger).toBeVisible();
    await expect(this.percentOffToggle).toBeVisible();
    await expect(this.multiplierToggle).toBeVisible();
    await expect(this.isActiveCheckbox).toBeVisible();
    await expect(this.saveButton).toBeVisible();
  }

  async selectManufacturer(name: string): Promise<void> {
    await this.selectCustomSelectOption('DiscountStructure_Manufacturer', name);
  }

  async selectPartCategory(name: string): Promise<void> {
    await this.selectCustomSelectOption('DiscountStructure_CategoryPartId', name);
  }

  async choosePercentOffMode(): Promise<void> {
    await this.percentOffToggle.click();
  }

  async fillValue(value: string): Promise<void> {
    await this.valueInput.fill(value);
  }

  /**
   * `date` as MM/DD/YYYY. Blurs with Tab rather than a click elsewhere: the picker's calendar
   * overlay stays open after fill() and intercepts clicks on the rest of the panel.
   */
  async fillEffectiveTo(date: string): Promise<void> {
    const input = this.dialog
      .locator('.mb-3', { has: this.page.locator('label', { hasText: 'Effective To' }) })
      .locator('input[data-datepicker="true"]');
    await input.fill(date);
    await input.press('Tab');
  }

  async setActive(active: boolean): Promise<void> {
    if ((await this.isActiveCheckbox.isChecked()) !== active) {
      await this.isActiveCheckbox.click();
    }
  }

  /** The preview shows placeholder text until it loads, so wait for the real text. */
  async waitForPreview(): Promise<string> {
    await expect(this.previewText).toHaveText(/Would net \d+/i, { timeout: 15000 });
    return (await this.previewText.innerText()).trim();
  }

  async save(): Promise<void> {
    await this.saveButton.click();
  }
}
