import { Page, Locator, expect } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';

/** BOM review stage (`...&stage=bom`). Approve moves the bid to Estimate. */
export class BomReviewPage extends BuildRoomBasePage {
  private readonly approveBomButton: Locator;

  constructor(page: Page) {
    super(page);
    this.approveBomButton = page.getByRole('button', { name: 'Approve BOM' });
  }

  /** One-way transition, same shape as Generate BOM — there is no "unapprove." */
  async approveBom(): Promise<void> {
    await this.waitForBuildRoomLoaders();
    await this.approveBomButton.waitFor({ state: 'visible', timeout: 30000 });
    await expect(this.approveBomButton).toBeEnabled({ timeout: 30000 });
    await this.approveBomButton.click();
    await this.confirmYes();
    await this.waitForStage('estimate', 120000);
    await this.waitForBuildRoomLoaders();
  }
}
