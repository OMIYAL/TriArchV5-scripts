import { Page, Locator, expect } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';

/**
 * Quote review stage (`...&stage=quote`): the proposal document and "Send for approval".
 */
export class QuoteReviewPage extends BuildRoomBasePage {
  private readonly sendForApprovalButton: Locator;

  constructor(page: Page) {
    super(page);
    this.sendForApprovalButton = page.locator('#QuoteSendBtn');
  }

  /** Saves and goes to Approval. */
  async sendForApproval(): Promise<void> {
    await this.waitForBuildRoomLoaders();
    await this.sendForApprovalButton.waitFor({ state: 'visible', timeout: 30000 });
    await expect(this.sendForApprovalButton).toBeEnabled({ timeout: 30000 });
    await this.sendForApprovalButton.click();
    const yes = this.page.getByRole('button', { name: 'Yes', exact: true });
    if (await yes.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      await yes.click();
    }
    await this.waitForStage('approval', 120000);
    await this.waitForBuildRoomLoaders();
  }
}
