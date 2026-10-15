import { Page, Locator, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { BuildRoomBasePage } from '../base.page';

/**
 * The "Pick general contractor" slide-over used on ITB intake (and anywhere else that reuses it).
 *
 * The panel keeps `aria-hidden` while open, so role locators never match — scope by CSS id.
 * Options are clickable rows; the native radios inside them are visually hidden.
 */
export class GeneralContractorPickerComponent extends BuildRoomBasePage {
  readonly panel: Locator;
  private readonly optionRows: Locator;
  private readonly selectButton: Locator;

  constructor(page: Page) {
    super(page);
    this.panel = page.locator('#GeneralContractorPickerPanel');
    this.optionRows = this.panel.locator('[role="radiogroup"] > *');
    this.selectButton = this.panel.locator('button', { hasText: 'Select' });
  }

  private async waitForOptions(): Promise<void> {
    await this.panel.waitFor({ state: 'visible', timeout: 30000 });
    await expect(this.optionRows.first(), 'GC picker should list at least one contractor').toBeVisible({
      timeout: 20000,
    });
  }

  /**
   * Picks the first or second listed GC at random so the flow is tenant-agnostic.
   * If only one GC is present, that one is selected.
   */
  async pickRandomFirstOrSecond(): Promise<void> {
    await this.waitForOptions();
    const count = await this.optionRows.count();
    if (count === 0) {
      throw new Error('No general contractors available in the GC picker.');
    }
    const index = faker.number.int({ min: 0, max: Math.min(1, count - 1) });
    const row = this.optionRows.nth(index);
    const name = ((await row.innerText()) || '').split('\n')[0].trim();
    console.log(`[gc-picker] Selecting GC #${index + 1} of ${count}: ${name || '(unnamed)'}`);
    await this.chooseRow(row);
  }

  /** Clicks the visible row; force-checks the hidden radio if the row click didn't take. */
  private async chooseRow(row: Locator): Promise<void> {
    await row.click();
    const radio = row.locator('input[type="radio"], [role="radio"]').first();
    if ((await radio.count()) > 0 && !(await radio.isChecked().catch(() => false))) {
      await radio.check({ force: true });
    }
    await this.confirmSelection();
  }

  private async confirmSelection(): Promise<void> {
    await expect(this.selectButton).toBeEnabled({ timeout: 10000 });
    await this.selectButton.click();
    await this.panel.waitFor({ state: 'hidden', timeout: 15000 });
  }
}
