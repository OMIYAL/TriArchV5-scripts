import { Page, Locator, expect } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';
import { CountLogComponent } from './components/count-log.component';
import { PlanViewerComponent } from './components/plan-viewer.component';

/**
 * Take-Off stage (`...&stage=takeoff`): add devices from the catalog, then place them on the plan
 * and generate the BOM.
 *
 * The sidebar and catalog panel are aria-hidden, so most locators here are CSS ids/text rather
 * than roles.
 */
export class TakeOffPage extends BuildRoomBasePage {
  readonly viewer: PlanViewerComponent;
  readonly countLog: CountLogComponent;
  readonly addDeviceButton: Locator;
  private readonly generateBomButton: Locator;
  private readonly placeOnPlanButton: Locator;
  private readonly activePlanButton: Locator;

  constructor(page: Page) {
    super(page);
    this.viewer = new PlanViewerComponent(page);
    this.countLog = new CountLogComponent(page);
    this.addDeviceButton = page.locator('#ta-takeoff-add-manual-device-btn');
    this.generateBomButton = page.locator('#GenerateBomBtn');
    this.placeOnPlanButton = page.getByRole('button', { name: 'Place on plan' });
    this.activePlanButton = page.locator('#ta-takeoff-plan-btn');
  }

  /** Waits for the loading overlays to clear and the plan to finish rendering. */
  async settle(): Promise<void> {
    await this.waitForBuildRoomLoaders();
    await this.viewer.waitForRendered();
  }

  private catalogPanel(): Locator {
    return this.page.locator('[role="dialog"]').filter({ hasText: 'Add device from catalog' });
  }

  /** Opens the "Add device from catalog" slide-over. */
  async openCatalog(): Promise<void> {
    const panel = this.catalogPanel();
    if (await panel.isVisible().catch(() => false)) return;
    await this.openOffcanvasPanel(this.addDeviceButton, panel);
  }

  /**
   * Adds the first point-count catalog device not already picked. Skips length-based parts and
   * names that would collide with substring locators in the count log.
   */
  async addAnyCatalogDevice(exclude: string[] = []): Promise<string> {
    const panel = this.catalogPanel();
    if (!(await panel.isVisible().catch(() => false))) await this.openCatalog();
    await this.ensureCatalogRowsVisible(panel);
    const rows = panel.locator('li.ta-catalog-row');
    for (const row of await rows.all()) {
      const rowText = await row.innerText();
      if (/assembly|click to view components/i.test(rowText)) continue;
      const name = await this.rowName(row);
      if (!this.isUsablePointDevice(name, exclude)) continue;
      await row.locator('button').first().click();
      await this.page.locator('button', { hasText: 'Add to count log' }).click();
      await this.settle();
      const logName = await this.countLog.selectedOrLastRowLabel();
      await this.countLog.select(logName);
      console.log(`[catalog] Added device: ${logName}`);
      return logName;
    }
    throw new Error('No usable point-count device found in this tenant\'s catalog.');
  }

  async removeAllDevices(): Promise<void> {
    await this.settle();
    await this.countLog.removeAll();
  }

  /**
   * Moves to any sheet other than the active one. A one-sheet project, a disabled dropdown, or a
   * failed switch is not treated as failure so Generate BOM can still run.
   */
  async changeToAnotherPlan(): Promise<void> {
    try {
      const current = (await this.activePlanButton.innerText()).trim();
      if (await this.activePlanButton.isEnabled()) {
        await this.openPlanMenu();
        const item = this.planMenu()
          .locator('a, button, li')
          .filter({ hasNotText: new RegExp(`^\\s*${this.escapeRegex(current)}\\s*$`, 'i') })
          .first();
        if ((await item.count()) === 0) {
          console.warn('[take-off] Only one plan sheet — nothing to switch to.');
          await this.activePlanButton.press('Escape').catch(() => {});
          return;
        }
        await item.click();
      } else {
        const nav = this.page.getByRole('group', { name: 'Sheet navigation' });
        const next = nav.getByRole('button', { name: 'Next sheet' });
        const prev = nav.getByRole('button', { name: 'Previous sheet' });
        if (await next.isEnabled()) await next.click();
        else if (await prev.isEnabled()) await prev.click();
        else {
          console.warn('[take-off] Only one plan sheet — nothing to switch to.');
          return;
        }
      }
      await this.settle();
    } catch (err) {
      console.warn(`[take-off] Could not switch plan sheet: ${err}`);
    }
  }

  private async openPlanMenu(): Promise<void> {
    await this.activePlanButton.click();
    const opened = await expect(this.activePlanButton)
      .toHaveAttribute('aria-expanded', 'true', { timeout: 2000 })
      .then(() => true, () => false);
    if (!opened) await this.activePlanButton.click();
  }

  private planMenu(): Locator {
    const scoped = this.activePlanButton
      .locator('xpath=ancestor::*[contains(@class,"dropdown") or contains(@class,"btn-group")][1]')
      .locator('[role="menu"], [role="listbox"], .dropdown-menu');
    return scoped.or(this.page.locator('.dropdown-menu.show'));
  }

  private async ensureCatalogRowsVisible(panel: Locator): Promise<void> {
    const rows = panel.locator('li.ta-catalog-row');
    if (await rows.first().isVisible({ timeout: 5000 }).catch(() => false)) return;
    await panel.locator('#CatalogDeviceSearch').fill('a');
    await rows.first().waitFor({ state: 'visible', timeout: 20000 });
  }

  private async rowName(row: Locator): Promise<string> {
    const title = row.locator('.ta-catalog-row__title, [class*="catalog"][class*="title"]').first();
    if ((await title.count()) > 0) {
      const text = (await title.innerText()).trim();
      if (text) return text.split('\n')[0].trim();
    }
    return ((await row.innerText()).split('\n').map((s) => s.trim()).find(Boolean)) ?? '';
  }

  private isUsablePointDevice(name: string, exclude: string[]): boolean {
    if (!name || name.length < 3) return false;
    const lower = name.toLowerCase();
    if (/assembly|click to view components/i.test(lower)) return false;
    if (/\b(per\s*ft|\/\s*ft|per\s*foot|linear| lf\b)\b/i.test(lower)) return false;
    if (exclude.some((e) => e.includes(name) || name.includes(e))) return false;
    return true;
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Places one point of the selected device at the centre of the visible sheet. */
  async placeDeviceOnPlan(): Promise<void> {
    await this.closeCatalogIfOpen();
    await this.settle();
    const before = await this.countLog.selectedTotal();
    await this.placeOnPlanButton.click();
    const { x, y } = await this.viewer.visibleCenter();
    await this.page.mouse.click(x, y);
    await expect.poll(() => this.countLog.selectedTotal(), { timeout: 15000 }).toBeGreaterThan(before);
    await this.placeOnPlanButton.click();
  }

  async generateBom(): Promise<void> {
    await this.closeCatalogIfOpen();
    await this.exitPlaceMode();
    await this.settle();
    if (!(await this.generateBomButton.isEnabled().catch(() => false))) {
      await this.changeToAnotherPlan();
    }
    await expect(this.generateBomButton).toBeEnabled({ timeout: 30000 });
    await this.generateBomButton.click();
    await this.confirmYes();
    await this.waitForStage('bom', 120000);
    await this.waitForBuildRoomLoaders();
    await this.page.getByRole('button', { name: 'Approve BOM' }).waitFor({ state: 'visible', timeout: 30000 });
  }

  private async exitPlaceMode(): Promise<void> {
    const pressed = await this.placeOnPlanButton.getAttribute('aria-pressed').catch(() => null);
    const className = (await this.placeOnPlanButton.getAttribute('class').catch(() => '')) ?? '';
    if (pressed === 'true' || /\bis-active\b|\bactive\b/.test(className)) {
      await this.placeOnPlanButton.click();
    }
  }

  private async closeCatalogIfOpen(): Promise<void> {
    const panel = this.catalogPanel();
    if (!(await panel.isVisible().catch(() => false))) return;
    const close = panel.locator('button.btn-close, [aria-label="Close"]').first();
    if (await close.isVisible().catch(() => false)) await close.click();
    await panel.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }
}
