import { Page, Locator, expect } from '@playwright/test';
import { BuildRoomBasePage } from '../base.page';

/**
 * The Catalog Part slide-over, used to edit a part and to create a new one. Plain inputs are found
 * by label; the custom selects (UoM, Part Category) go through `customSelectTrigger()`.
 *
 * Waste allowance rejects values like "1.90" because of its `step="0.1"`, so `save()` re-fills it
 * with 0 first. `saveWithoutWasteAllowanceFix()` skips that.
 */
export class CatalogPartEditComponent extends BuildRoomBasePage {
  readonly dialog: Locator;
  readonly nameInput: Locator;
  readonly catalogNumberInput: Locator;
  readonly uomSelectTrigger: Locator;
  readonly partCategorySelectTrigger: Locator;
  readonly tradeListPriceInput: Locator;
  readonly netCostInput: Locator;
  readonly wasteAllowanceInput: Locator;
  readonly vendorPricesHeading: Locator;
  readonly addVendorPriceButton: Locator;
  readonly vendorSearchInput: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly deactivateButton: Locator;

  constructor(page: Page) {
    super(page);
    this.dialog = page.locator('#CatalogPartEditPanel');
    this.nameInput = page.getByLabel('Name *', { exact: true });
    this.catalogNumberInput = page.getByLabel('Catalog Number', { exact: true });
    this.uomSelectTrigger = this.customSelectTrigger('CatalogPart_UnitsOfMeasureId');
    this.partCategorySelectTrigger = this.customSelectTrigger('CatalogPart_CategoryPartId');
    this.tradeListPriceInput = page.getByLabel('Trade List Price', { exact: true });
    this.netCostInput = page.getByLabel('Net Cost', { exact: true });
    this.wasteAllowanceInput = page.getByLabel(/Waste allowance/i);
    // Exact, inside the panel: a search tooltip elsewhere also contains "vendor prices".
    this.vendorPricesHeading = this.dialog.getByText('Vendor prices', { exact: true });
    this.addVendorPriceButton = this.dialog.locator('#VendorPriceAddButton');
    this.vendorSearchInput = page.getByPlaceholder('Search vendors to add…');
    this.saveButton = this.dialog.locator('button', { hasText: 'Save' });
    this.cancelButton = this.dialog.locator('button', { hasText: 'Cancel' });
    this.deactivateButton = this.dialog.locator('#DeactivateCatalogPartButton');
  }

  async waitForOpen(): Promise<void> {
    await this.nameInput.waitFor({ state: 'visible', timeout: 30000 });
  }

  async assertKeyFieldsVisible(): Promise<void> {
    await expect(this.nameInput).toBeVisible();
    await expect(this.catalogNumberInput).toBeVisible();
    await expect(this.uomSelectTrigger).toBeVisible();
    await expect(this.tradeListPriceInput).toBeVisible();
    await expect(this.netCostInput).toBeVisible();
    await expect(this.vendorPricesHeading).toBeVisible();
    await expect(this.saveButton).toBeVisible();
  }

  async selectUnitOfMeasure(label: string): Promise<void> {
    await this.selectCustomSelectOption('CatalogPart_UnitsOfMeasureId', label);
  }

  async selectPartCategory(label: string): Promise<void> {
    await this.selectCustomSelectOption('CatalogPart_CategoryPartId', label);
  }

  async fillName(name: string): Promise<void> {
    await this.nameInput.fill(name);
  }

  async fillCatalogNumber(catalogNumber: string): Promise<void> {
    await this.catalogNumberInput.fill(catalogNumber);
  }

  async fillTradeListPrice(value: string): Promise<void> {
    await this.tradeListPriceInput.fill(value);
  }

  async fillNetCost(value: string): Promise<void> {
    await this.netCostInput.fill(value);
  }

  // ---- Vendor prices ----
  // Rows share the same input labels, so each is found through vendorRow(). "Use this price" and
  // "Stop using" are one button whose text follows the row's state; both ask for confirmation.

  async addVendorPrice(vendorName: string): Promise<void> {
    // This section loads after the rest of the panel.
    await this.vendorPricesHeading.waitFor({ state: 'visible', timeout: 30000 });
    await this.addVendorPriceButton.click();
    await this.vendorSearchInput.waitFor({ state: 'visible', timeout: 10000 });
    await this.page.locator('#VendorPriceSearchResults .search-name', { hasText: vendorName }).click();
  }

  /** Matched by substring: the followed vendor's name has an "In use" badge appended. */
  private vendorRow(vendorName: string): Locator {
    return this.page
      .locator('#VendorPriceList > .ta-assembly-component-row')
      .filter({ has: this.page.locator('.ta-assembly-component-row__name', { hasText: vendorName }) });
  }

  async fillVendorPrice(vendorName: string, price: string): Promise<void> {
    await this.vendorRow(vendorName).locator('input[data-field="price"]').fill(price);
  }

  async fillVendorQuoteNo(vendorName: string, quoteNo: string): Promise<void> {
    await this.vendorRow(vendorName).locator('input[data-field="quoteRef"]').fill(quoteNo);
  }

  /** Takes an ISO date ("2026-12-31"); the widget reformats it to MM/DD/YYYY. */
  async fillVendorExpires(vendorName: string, isoDate: string): Promise<void> {
    await this.vendorRow(vendorName).locator('.ta-vendor-prices__expires input').fill(isoDate);
  }

  async hasVendorRow(vendorName: string): Promise<boolean> {
    return this.vendorRow(vendorName).isVisible({ timeout: 5000 }).catch(() => false);
  }

  /** Name of the vendor whose price is in use (without the badge), or null. Net Cost is read-only while one is followed. */
  async getFollowedVendorName(): Promise<string | null> {
    const rows = this.page.locator('#VendorPriceList > .ta-assembly-component-row');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const isFollowed = await row
        .locator('.ta-vendor-prices__use', { hasText: 'Stop using' })
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (isFollowed) {
        const rawName = await row.locator('.ta-assembly-component-row__name').textContent();
        return rawName?.replace(/\s*In use\s*$/i, '').trim() ?? null;
      }
    }
    return null;
  }

  /** Switches to "Manual override" pricing if not already on it. Not available while a vendor is followed. */
  async ensureManualPricingMode(): Promise<void> {
    const manualPill = this.dialog.locator('.ta-chip[data-price-source-option="ManualOverride"]');
    const isActive = await manualPill.evaluate((el) => el.classList.contains('is-active'));
    if (!isActive) {
      await manualPill.click();
    }
  }

  /** Removes the row from the form (the picker won't offer a vendor already listed). Call save() after. */
  async removeVendorRow(vendorName: string): Promise<void> {
    await this.vendorRow(vendorName).locator('.ta-assembly-remove-btn').click();
  }

  async isFollowingVendor(vendorName: string): Promise<boolean> {
    return this.vendorRow(vendorName)
      .locator('.ta-vendor-prices__use', { hasText: 'Stop using' })
      .isVisible({ timeout: 5000 })
      .catch(() => false);
  }

  /** Force-clicks: the row's clipped parent makes Playwright report a false interception. */
  async useVendorPrice(vendorName: string): Promise<void> {
    await this.vendorRow(vendorName).locator('.ta-vendor-prices__use', { hasText: 'Use this price' }).click({ force: true });
    await this.confirmYes();
  }

  /** Net cost stays at the vendor's last price afterwards. Force-clicks, as useVendorPrice() does. */
  async stopUsingVendor(vendorName: string): Promise<void> {
    await this.vendorRow(vendorName).locator('.ta-vendor-prices__use', { hasText: 'Stop using' }).click({ force: true });
    await this.confirmYes();
  }

  async save(): Promise<void> {
    await this.wasteAllowanceInput.fill('0');
    await this.saveButton.click();
  }

  /** Saves without resetting Waste allowance first. */
  async saveWithoutWasteAllowanceFix(): Promise<void> {
    await this.saveButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}
