import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../base.page';

export type ProjectStage = 'takeoff' | 'bom' | 'estimate' | 'quote' | 'approval' | 'submit';

/** The stages of a launched project in workflow order, with the names shown on the stage bar. */
export const STAGE_LABELS: Record<ProjectStage, string> = {
  takeoff: 'Take-Off',
  bom: 'BOM review',
  estimate: 'Estimate',
  quote: 'Quote review',
  approval: 'Approval',
  submit: 'Submit',
};

/** Base for BuildRoom pages. Extends the shared BasePage; Control Room's `waitForLoaders()` doesn't apply here. */
export class BuildRoomBasePage extends BasePage {
  constructor(page: Page, baseUrl: string = process.env.BUILDROOM_BASE_URL || '') {
    super(page, baseUrl);
  }

  /** Opens a project's stage page (Take-Off, BOM review, ...). */
  async gotoStage(projectId: string, stage: ProjectStage): Promise<void> {
    await this.page.goto(`${this.baseUrl}/BuildRoom/Projects/LaunchPhase?id=${projectId}&stage=${stage}`, {
      waitUntil: 'domcontentloaded',
    });
  }

  /** Waits for the app to move to a stage page. */
  async waitForStage(stage: ProjectStage, timeout = 30000): Promise<void> {
    await this.page.waitForURL(new RegExp(`LaunchPhase\\?.*stage=${stage}`), { timeout });
  }

  /** A step on the stage bar at the top of a launched project; it carries `is-complete` or `is-locked`. */
  stageStep(stage: ProjectStage): Locator {
    return this.page.locator('.ta-launch-stages__step', { hasText: STAGE_LABELS[stage] });
  }

  /** Every stage before `stage` is complete and every stage after it is locked. */
  async expectWorkflowAt(stage: ProjectStage): Promise<void> {
    const order = Object.keys(STAGE_LABELS) as ProjectStage[];
    const at = order.indexOf(stage);
    for (const [index, name] of order.entries()) {
      if (index < at) await expect(this.stageStep(name), `${STAGE_LABELS[name]} should be complete`).toHaveClass(/is-complete/);
      if (index > at) await expect(this.stageStep(name), `${STAGE_LABELS[name]} should be locked`).toHaveClass(/is-locked/);
    }
  }

  /** Answers "Yes" on the confirmation dialog. */
  protected async confirmYes(): Promise<void> {
    await this.page.getByRole('button', { name: 'Yes', exact: true }).click();
  }

  /** "$20,234.40" → 20234.4. Throws if the text has no amount. */
  protected parseMoney(text: string): number {
    const match = text.match(/-?\$?\s*([\d,]+(?:\.\d+)?)/);
    if (!match) throw new Error(`No amount found in "${text}".`);
    return parseFloat(match[1].replace(/,/g, ''));
  }

  /** Matches a cell whose whole text is `text`. */
  protected exactText(text: string): RegExp {
    return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  }

  /** Waits for the platform ABP busy overlay and `.ta-stage-loading` (e.g. "Loading plan…") to clear. */
  async waitForBuildRoomLoaders(timeout = 60000): Promise<void> {
    const overlays = this.page.locator('.abp-block-area-busy, .ta-stage-loading');
    const count = await overlays.count();
    for (let i = 0; i < count; i++) {
      await overlays.nth(i).waitFor({ state: 'hidden', timeout }).catch(() => {});
    }
  }

  /**
   * Opens a slide-over panel. The trigger is a toggle, so it is clicked once, never retried. The
   * panels carry `aria-hidden` while open, so role locators don't work inside them — use CSS ids.
   */
  protected async openOffcanvasPanel(trigger: Locator, panel: Locator, timeout = 30000): Promise<void> {
    await trigger.click();
    await panel.waitFor({ state: 'visible', timeout });
  }

  /** The visible half of a "custom select": a hidden native `<select>` followed by `.custom-select-display`. */
  protected customSelectTrigger(selectId: string): Locator {
    return this.page.locator(`#${selectId} + .custom-select-display`);
  }

  /** The listbox id comes from the trigger's `aria-controls` and changes between renders, so it is read each time. */
  protected async selectCustomSelectOption(selectId: string, optionLabel: string): Promise<void> {
    const trigger = this.customSelectTrigger(selectId);
    await trigger.click();
    const listboxId = await trigger.getAttribute('aria-controls');
    if (!listboxId) {
      throw new Error(`Custom select trigger for #${selectId} has no aria-controls — can't locate its listbox.`);
    }
    await this.page
      .locator(`#${listboxId}`)
      .locator('.custom-option', { hasText: this.exactText(optionLabel) })
      .click();
  }
}
