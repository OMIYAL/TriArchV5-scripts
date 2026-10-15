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

  /** Advances to Approval. No-op if the app has already moved past this stage. */
  async sendForApproval(): Promise<void> {
    await this.waitForBuildRoomLoaders();
    // Guard: if the app already advanced to Approval (e.g. from a prior run's project), skip
    if (/stage=approval/i.test(this.page.url())) return;

    await this.page.keyboard.press('Escape');
    await this.clickSendForApproval();

    // A dirty quote refreshes on the first click and stays on this page — click once more
    if (await this.sendForApprovalButton.isVisible().catch(() => false)) {
      await this.waitForBuildRoomLoaders();
      await this.clickSendForApproval();
    }

    const yes = this.page.getByRole('button', { name: 'Yes', exact: true });
    if (await yes.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
      await yes.click();
    }
    await this.waitForStage('approval', 120000);
    await this.waitForBuildRoomLoaders();
  }

  private async clickSendForApproval(): Promise<void> {
    await this.sendForApprovalButton.waitFor({ state: 'visible', timeout: 30000 });
    await expect(this.sendForApprovalButton).toBeEnabled({ timeout: 30000 });
    await this.sendForApprovalButton.click();
  }
}
