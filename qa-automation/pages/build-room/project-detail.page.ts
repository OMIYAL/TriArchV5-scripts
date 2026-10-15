import { Page, Locator, expect } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';
import { BidDecisionComponent } from './components/bid-decision.component';

/**
 * Project detail (`/BuildRoom/Projects/Detail`). A new project already has a default department
 * and trade scope, so launch clicks the header Launch phase button for that scope.
 */
export class ProjectDetailPage extends BuildRoomBasePage {
  private readonly launchPhaseButton: Locator;
  private readonly openEstimationLink: Locator;

  constructor(page: Page) {
    super(page);
    // The overview toolbar button next to Edit. A second Launch phase control lives in a
    // hidden panel and must not be included, or the click fails in strict mode.
    this.launchPhaseButton = page.locator('.ta-page-actions').getByRole('button', { name: 'Launch phase' });
    this.openEstimationLink = page.getByRole('link', { name: 'Open estimation' });
  }

  async goto(projectId: string): Promise<void> {
    await this.page.goto(`${this.baseUrl}/BuildRoom/Projects/Detail?id=${projectId}`, {
      waitUntil: 'load',
    });
    await this.waitForBuildRoomLoaders();
  }

  /**
   * Opens Take-Off for the default phase. If the phase is already live, follows "Open estimation".
   */
  async launchAndOpenTakeOff(): Promise<void> {
    if (await this.openEstimationLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.openEstimationLink.click();
      await this.waitForStage('takeoff', 180000);
      return;
    }
    await new BidDecisionComponent(this.page).recordGoDecision();
    await this.launchPhaseButton.waitFor({ state: 'visible', timeout: 30000 });
    await expect(this.launchPhaseButton).toBeEnabled({ timeout: 30000 });
    await this.launchPhase();
  }

  /**
   * Launches the default trade scope and waits for Take-Off. Large ITB drawing sets can take several
   * minutes. Reloading cancels in-progress prep, so we wait on "Preparing drawings" instead.
   */
  async launchPhase(): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    const preparing = this.page.getByText(/Preparing drawings/i).first();
    const opened = (ms: number) => this.waitForStage('takeoff', ms).then(() => true).catch(() => false);

    for (let click = 0; click < 2; click++) {
      await this.launchPhaseButton.click({ timeout: 15000 }).catch(() => {});
      if (await opened(15000)) return;
      if (await preparing.isVisible().catch(() => false)) break;
    }

    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      if (await opened(10000)) return;
      if (!(await preparing.isVisible().catch(() => false))) break;
    }
    if (await opened(5000)) return;

    if (!(await preparing.isVisible().catch(() => false))) {
      console.log('[launch] Preparing panel gone but Take-Off not open — pressing Launch again');
      await this.launchPhaseButton.click({ timeout: 15000 }).catch(() => {});
      if (await opened(180000)) return;
    }

    throw new Error('Take-Off did not open after Launch phase. Drawings may still be preparing.');
  }
}
