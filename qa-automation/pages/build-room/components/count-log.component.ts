import { Page, Locator } from '@playwright/test';
import { BuildRoomBasePage } from '../base.page';

/** The Take-Off sidebar's count log: one row per device, with its quantity and a remove control. */
export class CountLogComponent extends BuildRoomBasePage {
  private readonly rows: Locator;

  constructor(page: Page) {
    super(page);
    this.rows = page.locator('button.ta-takeoff__count-row');
  }

  row(deviceName: string): Locator {
    return this.rows.filter({ hasText: deviceName });
  }

  /** Assert on its `aria-label` (e.g. "3 total · 3 placed manually"), not the visible text. */
  qtyBadge(deviceName: string): Locator {
    return this.row(deviceName).locator('.ta-takeoff__count-qty');
  }

  /** Quantity badge of the currently selected device row. */
  selectedQtyBadge(): Locator {
    return this.page.locator('button.ta-takeoff__count-row[aria-pressed="true"] .ta-takeoff__count-qty');
  }

  /** The selected device's total as a number, e.g. 3 from "3 total · 3 placed manually". */
  async selectedTotal(): Promise<number> {
    const label = (await this.selectedQtyBadge().getAttribute('aria-label')) ?? '';
    return parseFloat(label) || 0;
  }

  /** Label shown on the selected row, or the last row after a new add. */
  async selectedOrLastRowLabel(): Promise<string> {
    const selected = this.page.locator('button.ta-takeoff__count-row[aria-pressed="true"]').first();
    if ((await selected.count()) > 0) return this.primaryLabel(selected);
    return this.primaryLabel(this.rows.last());
  }

  /** Makes this device the active count-log row so Place on plan applies to it. */
  async select(deviceName: string): Promise<void> {
    const row = this.row(deviceName).first();
    await row.waitFor({ state: 'visible', timeout: 15000 });
    if ((await row.getAttribute('aria-pressed')) === 'true') return;
    await row.click();
  }

  private async primaryLabel(row: Locator): Promise<string> {
    await row.waitFor({ state: 'visible', timeout: 15000 });
    const named = row.locator('.ta-takeoff__count-name').first();
    if ((await named.count()) > 0) {
      const text = (await named.innerText()).trim();
      if (text) return text;
    }
    return ((await row.innerText()).split('\n').map((s) => s.trim()).find(Boolean)) ?? '';
  }

  async removeAll(): Promise<void> {
    for (let guard = 0; guard < 25; guard++) {
      if ((await this.rows.count()) === 0) return;
      await this.removeRow(this.rows.first());
    }
    throw new Error('The count log still has devices after 25 removals.');
  }

  /** The remove button sits under the quantity badge until the row is hovered; removal asks Yes/No. */
  private async removeRow(row: Locator): Promise<void> {
    const before = await this.rows.count();
    await row.hover();
    await row
      .locator('xpath=ancestor::*[.//button[contains(@class,"ta-takeoff__count-remove")]][1]')
      .locator('.ta-takeoff__count-remove')
      .click();
    await this.confirmYes();
    await this.page.waitForFunction(
      (prev) => document.querySelectorAll('button.ta-takeoff__count-row').length < prev,
      before,
      { timeout: 30000 }
    );
  }
}
