import { Page, Locator } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';

/**
 * BOM review stage (/BuildRoom/Projects/LaunchPhase?...&stage=bom). A take-off-placed device
 * appears here as its own BOM line with a "Provenance" note (counted via take-off, by whom, and
 * the book price frozen in at that point).
 */
export class BomReviewPage extends BuildRoomBasePage {
  private readonly approveBomButton: Locator;

  constructor(page: Page) {
    super(page);
    this.approveBomButton = page.locator('button', { hasText: 'Approve BOM' });
  }

  /** Scoped to `data-bom-line` — a plain text filter also matches the row's own Provenance detail row. */
  bomLineRow(partName: string): Locator {
    return this.page.locator('tr[data-bom-line]', { hasText: partName });
  }

  /** The "Provenance · how this line got here" row — a separate `<tr>`, not nested in the line row. */
  provenanceRow(partName: string): Locator {
    return this.page.locator('tr', { hasText: 'Provenance' }).filter({ hasText: partName });
  }

  /** One-way transition, same shape as Generate BOM — there is no "unapprove." */
  async approveBom(): Promise<void> {
    await this.approveBomButton.click();
    await this.confirmYes();
    await this.waitForStage('estimate');
  }
}
