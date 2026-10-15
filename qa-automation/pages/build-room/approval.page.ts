import { Page, Locator, expect } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';

/**
 * Approval stage (`...&stage=approval`): every current approver must sign before Submit opens.
 * `#ApprovalGateBtn` is the "Awaiting sign-off" status badge — NOT the Sign action.
 * The Sign action is `button.ap-sign-open-btn`; clicking it opens a "Confirm sign-off" panel
 * containing `#ap-sign-confirm` (the final Sign button).
 */
export class ApprovalPage extends BuildRoomBasePage {
  private readonly signButton: Locator;
  private readonly refreshApproversButton: Locator;
  private readonly signConfirmButton: Locator;

  constructor(page: Page) {
    super(page);
    this.signButton = page.locator('button.ap-sign-open-btn');
    this.refreshApproversButton = page.getByRole('button', { name: 'Refresh approvers' });
    this.signConfirmButton = page.locator('#ap-sign-confirm');
  }

  /**
   * Signs as the logged-in account. A stale roster leaves Sign disabled; Refresh approvers fixes that.
   * The first click can be swallowed while loaders settle, hence the retry loop.
   */
  async sign(): Promise<void> {
    await this.waitForBuildRoomLoaders();
    await this.prepareSignButton();

    for (let attempt = 0; attempt < 3; attempt++) {
      await this.signButton.click();
      // #ap-sign-confirm is always attached to the DOM; we must wait for visible, not attached
      const opened = await this.signConfirmButton
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      if (!opened) {
        await this.waitForBuildRoomLoaders();
        continue;
      }
      await this.clickConfirmSign();
      return;
    }
    throw new Error('The Confirm sign-off panel did not open after pressing Sign.');
  }

  /**
   * Clicks the confirm Sign button inside the panel. By the time this is called the retry loop
   * has confirmed the button is visible. scrollIntoViewIfNeeded() handles the case where the
   * panel footer sits just below the fold; a native Playwright click then fires all framework
   * event listeners — unlike a JS evaluate button.click() which can miss Vue/Angular bindings.
   */
  private async clickConfirmSign(): Promise<void> {
    // Dismiss any "quote edited" toast that might overlay the footer
    const toast = this.page.getByText(/edited the quote/i);
    if (await toast.isVisible().catch(() => false)) {
      await toast.locator('xpath=../button').click({ timeout: 2000 }).catch(() => {});
    }

    // Scroll into view if the footer is just below the fold, then native Playwright click
    await this.signConfirmButton.scrollIntoViewIfNeeded();
    await this.signConfirmButton.click();

    // Navigation to stage=submit can briefly invalidate the page reference — catch and verify.
    await this.waitForStage('submit', 60000).catch(async (err: Error) => {
      if (err.message.includes('Target page, context or browser has been closed')) {
        await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      } else {
        throw err;
      }
    });
    await this.waitForBuildRoomLoaders();
  }

  /** Enables Sign. Refresh is a no-op when this account can already sign. */
  private async prepareSignButton(): Promise<void> {
    await this.signButton.waitFor({ state: 'visible', timeout: 30000 });
    if (await this.signButton.isEnabled()) return;

    await expect(this.refreshApproversButton, 'Sign is disabled until the roster is refreshed').toBeVisible({
      timeout: 15000,
    });
    await this.refreshApproversButton.click();
    await expect(this.signButton, 'Refreshing approvers should let the logged-in account sign').toBeEnabled({
      timeout: 30000,
    });
  }
}
