import { Page, Locator, expect } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';
import { CountLogComponent } from './components/count-log.component';
import { PlanViewerComponent } from './components/plan-viewer.component';

/**
 * Take-Off stage (`...&stage=takeoff`): add devices from the catalog, then place them on the plan —
 * one point, a linear run, or specific symbols — and generate the BOM.
 *
 * The sidebar and catalog panel are aria-hidden, so most locators here are CSS ids/text rather
 * than roles. AI symbol detection is not covered.
 */
export class TakeOffPage extends BuildRoomBasePage {
  readonly viewer: PlanViewerComponent;
  readonly countLog: CountLogComponent;
  readonly addDeviceButton: Locator;
  private readonly generateBomButton: Locator;
  private readonly placeOnPlanButton: Locator;
  private readonly setScaleButton: Locator;
  private readonly activePlanButton: Locator;

  constructor(page: Page) {
    super(page);
    this.viewer = new PlanViewerComponent(page);
    this.countLog = new CountLogComponent(page);
    this.addDeviceButton = page.locator('#ta-takeoff-add-manual-device-btn');
    this.generateBomButton = page.locator('#GenerateBomBtn');
    this.placeOnPlanButton = page.getByRole('button', { name: 'Place on plan' });
    this.setScaleButton = page.locator('#ta-takeoff-scale-set-btn');
    this.activePlanButton = page.locator('#ta-takeoff-plan-btn');
  }

  /** Waits for the loading overlays to clear and the plan to finish rendering. */
  async settle(): Promise<void> {
    await this.waitForBuildRoomLoaders();
    await this.viewer.waitForRendered();
  }

  /** Searches first: the catalog holds thousands of parts and only a small page renders unfiltered. */
  async addDevice(deviceName: string): Promise<void> {
    const catalogPanel = this.page.locator('[role="dialog"]').filter({ hasText: 'Add device from catalog' });
    await this.openOffcanvasPanel(this.addDeviceButton, catalogPanel);
    await catalogPanel.locator('#CatalogDeviceSearch').fill(deviceName);
    const row = catalogPanel.locator('li.ta-catalog-row', { hasText: deviceName }).first();
    await row.waitFor({ state: 'visible', timeout: 20000 });
    await row.locator('button').first().click();
    await this.page.locator('button', { hasText: 'Add to count log' }).click();
    await this.settle(); // adding re-renders the plan behind an overlay that blocks pointer events
  }

  async removeAllDevices(): Promise<void> {
    await this.settle();
    await this.countLog.removeAll();
  }

  async removeDeviceIfPresent(deviceName: string): Promise<void> {
    await this.settle();
    await this.countLog.removeIfPresent(deviceName);
  }

  /**
   * Switches to a sheet by name. The dropdown is disabled when the project's floors have no sheets
   * assigned (it depends on what the AI extraction found), so then the sheet arrows are used.
   */
  async changeActivePlan(sheetName: string): Promise<void> {
    if (await this.activePlanButton.isEnabled()) {
      await this.activePlanButton.click();
      // The first click is sometimes ignored.
      const opened = await expect(this.activePlanButton).toHaveAttribute('aria-expanded', 'true', { timeout: 2000 }).then(() => true, () => false);
      if (!opened) await this.activePlanButton.click();
      const menu = this.page.locator('[role="menu"], [role="listbox"], .dropdown-menu').filter({ hasText: sheetName });
      await menu.locator('a, button, li', { hasText: sheetName }).first().click();
    } else {
      await this.stepToSheet(sheetName);
    }
    await this.settle();
  }

  /** Steps with the Next sheet arrow, then the Previous one, until the active plan is `sheetName`. */
  private async stepToSheet(sheetName: string): Promise<void> {
    const isActive = async () => (await this.activePlanButton.innerText()).trim().toLowerCase() === sheetName.toLowerCase();
    const sheetNav = this.page.getByRole('group', { name: 'Sheet navigation' });
    for (const arrow of ['Next sheet', 'Previous sheet']) {
      const button = sheetNav.getByRole('button', { name: arrow });
      for (let step = 0; step < 60 && !(await isActive()) && (await button.isEnabled()); step++) {
        await button.click();
        await this.settle();
      }
      if (await isActive()) return;
    }
    throw new Error(`Could not reach the "${sheetName}" sheet with the sheet arrows.`);
  }

  /** `commonScaleValue` is the option index in the "Common" dropdown, e.g. "3" = 1/8" = 1'-0". Scale is per sheet. */
  async setScale(unit: 'ft' | 'm' | 'in' | 'cm' | 'mm', commonScaleValue: string): Promise<void> {
    await this.setScaleButton.click();
    const popover = this.page.locator('#ta-takeoff-scale-popover');
    await popover.locator('[role="tab"][data-mode="common"]').click();
    await popover.locator('#ta-takeoff-scale-unit-select').selectOption(unit);
    await popover.locator('#ta-takeoff-scale-common-select').selectOption(commonScaleValue);
    await popover.locator('button', { hasText: 'Apply' }).click();
  }

  /** Places one point of the selected device at the centre of the visible sheet. */
  async placeDeviceOnPlan(): Promise<void> {
    await this.settle();
    await this.placeOnPlanButton.click();
    const { x, y } = await this.viewer.visibleCenter();
    await this.page.mouse.click(x, y);
    await this.placeOnPlanButton.click();
  }

  /** Places the selected device on symbols given as fractions of the sheet's canvas. */
  async placeDeviceOnSymbols(points: { fx: number; fy: number }[], zoomInTimes = 4): Promise<void> {
    await this.settle();
    await this.viewer.zoomIn(zoomInTimes);
    await this.placeOnPlanButton.click();
    for (const { fx, fy } of points) {
      const { cx, cy } = await this.viewer.centerOnPagePoint(fx, fy);
      await this.viewer.waitForPaintedAt([{ x: cx, y: cy }]);
      const before = await this.countLog.selectedTotal();
      await this.page.mouse.click(cx, cy);
      await expect.poll(() => this.countLog.selectedTotal(), { timeout: 15000 }).toBeGreaterThan(before);
    }
    await this.placeOnPlanButton.click();
  }

  /** Draws a linear run for the selected device. Needs `setScale()` first for the current sheet. */
  async placeLinearRun(): Promise<void> {
    await this.settle();
    await this.placeOnPlanButton.click();
    await this.page.waitForTimeout(500); // lets the app finish arming draw mode for the device
    await this.viewer.addLinearRun();
    await expect.poll(() => this.countLog.selectedTotal(), { timeout: 15000 }).toBeGreaterThan(0);
    await this.placeOnPlanButton.click();
  }

  async generateBom(): Promise<void> {
    await this.generateBomButton.click();
    await this.confirmYes();
    await this.waitForStage('bom');
  }
}
