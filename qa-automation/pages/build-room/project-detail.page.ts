import { Page, Locator, expect } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';

/**
 * Project detail (`/BuildRoom/Projects/Detail`): trade-scope settings and phase launch. Launching
 * needs a department; the department (and drawings) are locked from then on.
 */
export class ProjectDetailPage extends BuildRoomBasePage {
  private readonly configureTradeButton: Locator;
  private readonly launchPhaseButton: Locator;

  constructor(page: Page) {
    super(page);
    this.configureTradeButton = page.getByRole('button', { name: /^Configure/ });
    this.launchPhaseButton = page.getByRole('button', { name: 'Launch phase' });
  }

  async goto(projectId: string): Promise<void> {
    await this.page.goto(`${this.baseUrl}/BuildRoom/Projects/Detail?id=${projectId}`, {
      waitUntil: 'domcontentloaded',
    });
  }

  async assignDepartment(departmentName: string): Promise<void> {
    const settingsPanel = this.page.locator('#TradeScopeSettingsPanel');
    await this.openOffcanvasPanel(this.configureTradeButton, settingsPanel);

    const picker = settingsPanel.locator('#TradeScopeSettings_DepartmentPicker');
    await picker.waitFor({ state: 'visible', timeout: 20000 });
    const assignDialog = this.page.locator('#AssignDepartmentPanel');
    await this.openOffcanvasPanel(picker, assignDialog);

    const option = assignDialog.locator('.js-department-option', { hasText: departmentName }).first();
    await option.waitFor({ state: 'visible', timeout: 20000 });
    await option.click();
    await assignDialog.locator('#AssignDepartmentSubmitButton').click();

    // The panel stays open when the department is already the assigned one — close it by hand.
    const selfClosed = await assignDialog.waitFor({ state: 'hidden', timeout: 15000 }).then(() => true).catch(() => false);
    if (!selfClosed) {
      await assignDialog.locator('.btn-close').click();
      await assignDialog.waitFor({ state: 'hidden', timeout: 10000 });
    }

    // "Done" reloads the page once when the assignment was a real change.
    await Promise.all([
      this.page.waitForLoadState('load', { timeout: 30000 }),
      settingsPanel.locator('button', { hasText: 'Done' }).click(),
    ]);
    await this.launchPhaseButton.waitFor({ state: 'visible', timeout: 30000 });
    await expect(this.launchPhaseButton).toBeEnabled({ timeout: 30000 });
  }

  /**
   * Launches the trade (one-way) and waits for Take-Off, after the app has prepared the drawings
   * (~80s). The first click is sometimes ignored and the preparing panel sometimes stalls, so it
   * clicks again, and reloads and relaunches after ~2 minutes without progress.
   */
  async launchPhase(): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let attempt = 0; attempt < 4; attempt++) {
        await this.launchPhaseButton.click({ timeout: 15000 }).catch(() => {});
        if (await this.waitForStage('takeoff', 20000).then(() => true).catch(() => false)) return;
        if (await this.page.getByText(/Preparing drawings/).first().isVisible().catch(() => false)) break;
      }
      if (await this.waitForStage('takeoff', 120000).then(() => true).catch(() => false)) return;
      console.log(`[launch] Take-Off didn't open (cycle ${cycle + 1}) — reloading and pressing Launch again`);
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    }
    await this.waitForStage('takeoff', 60000);
  }
}
