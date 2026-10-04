import { Page, Locator } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';

/**
 * Estimate stage (`...&stage=estimate`): cost stack, overhead/contingency, extra cost lines, lock.
 */
export class EstimatePage extends BuildRoomBasePage {
  readonly directCostRow: Locator;
  private readonly lockEstimateButton: Locator;
  private readonly overheadToggle: Locator;
  private readonly overheadPctInput: Locator;
  private readonly contingencyToggle: Locator;
  private readonly contingencyPctInput: Locator;
  private readonly addLineButton: Locator;
  private readonly costLinePanel: Locator;

  constructor(page: Page) {
    super(page);
    this.directCostRow = page.locator('tr', { hasText: 'Direct cost' });
    this.lockEstimateButton = page.locator('#EstLockBtn');
    this.overheadToggle = page.locator('#EstOverheadOn');
    this.overheadPctInput = page.locator('#EstOverheadPct');
    this.contingencyToggle = page.locator('#EstContingencyOn');
    this.contingencyPctInput = page.locator('#EstContingencyPct');
    this.addLineButton = page.locator('button.br-cs__add');
    this.costLinePanel = page.locator('#AddCostLinePanel');
  }

  materialLineRow(partName: string): Locator {
    return this.page.locator('tr', { hasText: partName });
  }

  /** Direct cost from the price ladder. */
  async directCostAmount(): Promise<number> {
    return this.parseMoney(await this.page.locator('.acl-kv', { hasText: /^Direct cost/ }).first().innerText());
  }

  /** The bid price from the price ladder, once it has stopped recalculating. */
  async bidAmount(): Promise<number> {
    const bidRow = this.page.locator('.acl-kv--price');
    await bidRow.waitFor({ state: 'visible', timeout: 15000 });
    let previous = this.parseMoney(await bidRow.innerText());
    for (let attempt = 0; attempt < 10; attempt++) {
      await this.page.waitForTimeout(500);
      const current = this.parseMoney(await bidRow.innerText());
      if (current === previous) return current;
      previous = current;
    }
    throw new Error('The Estimate bid kept changing and never settled.');
  }

  /** Live-bound field — there is no separate save step. */
  async setOverheadPct(pct: string): Promise<void> {
    await this.setPct(this.overheadToggle, this.overheadPctInput, pct);
  }

  async setContingencyPct(pct: string): Promise<void> {
    await this.setPct(this.contingencyToggle, this.contingencyPctInput, pct);
  }

  private async setPct(toggle: Locator, input: Locator, pct: string): Promise<void> {
    if (!(await toggle.isChecked())) {
      await toggle.click();
    }
    await input.fill(pct);
    await input.blur();
  }

  async openAddCostLine(): Promise<void> {
    await this.addLineButton.click();
    await this.page.locator('.dropdown-menu.show', { hasText: 'Cost line' }).locator('a, button', { hasText: 'Cost line' }).click();
    await this.costLinePanel.waitFor({ state: 'visible', timeout: 15000 });
  }

  async selectCostCategory(categoryName: string): Promise<void> {
    await this.selectCustomSelectOption('Line_CostCategoryId', categoryName);
  }

  /** A dollar amount or a percentage, depending on the chosen category. */
  async fillCostLineValue(value: string): Promise<void> {
    await this.costLinePanel.locator('#Line_Value').fill(value);
  }

  async fillCostLineNotes(notes: string): Promise<void> {
    await this.costLinePanel.locator('#Line_Notes').fill(notes);
  }

  /** Server-computed preview, */
  costLinePreviewText(): Locator {
    return this.costLinePanel.locator('[data-preview-formula]');
  }

  async submitCostLine(): Promise<void> {
    await this.costLinePanel.locator('button[type="submit"]').click();
    await this.costLinePanel.waitFor({ state: 'hidden', timeout: 15000 });
  }

  async lockEstimate(): Promise<void> {
    await this.lockEstimateButton.click();
    await this.confirmYes();
    await this.waitForStage('quote');
  }
}
