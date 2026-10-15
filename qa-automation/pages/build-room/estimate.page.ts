import { Page, Locator } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';

/** Estimate stage (`...&stage=estimate`): lock the costed bid and move to Quote review. */
export class EstimatePage extends BuildRoomBasePage {
  private readonly lockEstimateButton: Locator;

  constructor(page: Page) {
    super(page);
    this.lockEstimateButton = page.locator('#EstLockBtn');
  }

  async lockEstimate(): Promise<void> {
    await this.lockEstimateButton.click();
    await this.confirmYes();
    await this.waitForStage('quote');
  }
}
