import { Page, Locator, expect } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';

/**
 * Approval stage (`...&stage=approval`): every current approver must sign before Submit opens.
 * `#ApprovalGateBtn` is the "Awaiting sign-off" status badge, not the Sign action.
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
   * Signs as the logged-in account. A stale roster leaves Sign disabled and names someone who is
   * no longer an approver; Refresh approvers replaces that roster with the current department,
   * which includes this account. The confirm Sign is in the panel footer, below the window, so it
   * is clicked from the page rather than with a mouse coordinate.
   */
  async sign(): Promise<void> {
    await this.prepareSignButton();
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.signButton.click();
      const opened = await this.signConfirmButton
        .waitFor({ state: 'attached', timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (!opened) continue;
      await this.clickConfirmSign();
      return;
    }
    throw new Error('The Confirm sign-off panel did not open after pressing Sign.');
  }

  /**
   * The confirm Sign sits in the offcanvas footer, below the window on a short viewport
   * (`data-below-floor`). A mouse click then fails with "outside of the viewport", so scroll
   * the panel and invoke the button's own click.
   */
  private async clickConfirmSign(): Promise<void> {
    await this.signConfirmButton.evaluate((button: HTMLButtonElement) => {
      const panel = button.closest('.offcanvas') as HTMLElement | null;
      const body = panel?.querySelector('.offcanvas-body') as HTMLElement | null;
      if (body) body.scrollTop = body.scrollHeight;
      if (panel) panel.scrollTop = panel.scrollHeight;
      button.scrollIntoView({ block: 'center', inline: 'nearest' });
      button.click();
    });
    await this.page
      .locator('.offcanvas.show')
      .filter({ has: this.page.locator('#ap-sign-confirm') })
      .waitFor({ state: 'hidden', timeout: 20000 });
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
