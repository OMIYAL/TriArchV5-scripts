import { Page, Locator } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';

/**
 * Approval stage (`...&stage=approval`): every member of the project's department must sign
 * before Submit opens. The department is fixed at launch, so a department whose only member is
 * the primary account needs a single signature.
 */
export class ApprovalPage extends BuildRoomBasePage {
  private readonly signButton: Locator;
  private readonly signConfirmButton: Locator;
  readonly signedCountText: Locator;

  constructor(page: Page) {
    super(page);
    this.signButton = page.locator('#ApprovalGateBtn');
    this.signConfirmButton = page.locator('#ap-sign-confirm');
    this.signedCountText = page.locator('text=/\\d+ of \\d+ signed/').first();
  }

  /**
   * Sign opens a "Confirm sign-off" panel; the signature counts only once its own Sign button is
   * pressed. An account that isn't on the roster gets no panel at all, so this throws. The first
   * click can be ignored right after the page loads, hence the retry.
   */
  async sign(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.signButton.click();
      if (await this.signConfirmButton.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
        await this.signConfirmButton.click();
        return;
      }
    }
    throw new Error('The Confirm sign-off panel did not open — is this account on the approval roster?');
  }
}
