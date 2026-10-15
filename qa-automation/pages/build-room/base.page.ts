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

  /** Waits for the app to move to a stage page. */
  async waitForStage(stage: ProjectStage, timeout = 30000): Promise<void> {
    await this.page.waitForURL(new RegExp(`LaunchPhase\\?.*stage=${stage}`, 'i'), { timeout });
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
      const step = this.stageStep(name);
      if (index < at) {
        await expect(step, `${STAGE_LABELS[name]} should be complete`).toHaveClass(/is-complete/, { timeout: 20000 });
      }
      if (index > at) {
        await expect
          .poll(
            async () => {
              const classes = (await step.getAttribute('class')) ?? '';
              return /is-locked/.test(classes) || (await step.isDisabled().catch(() => false));
            },
            { timeout: 20000, message: `${STAGE_LABELS[name]} should be locked` }
          )
          .toBeTruthy();
      }
    }
  }

  /** Answers "Yes" on the confirmation dialog. */
  protected async confirmYes(): Promise<void> {
    const yes = this.page.getByRole('button', { name: 'Yes', exact: true });
    await yes.waitFor({ state: 'visible', timeout: 15000 });
    await yes.click();
  }

  /**
   * Waits until no ABP busy overlay or `.ta-stage-loading` (e.g. "Loading plan…") is visible.
   * A one-shot count returns before a loader that has not been inserted yet, and a hidden
   * overlay left in the DOM must not keep this waiting.
   */
  async waitForBuildRoomLoaders(timeout = 60000): Promise<void> {
    const busy = this.page.locator('.abp-block-area-busy:visible, .ta-stage-loading:visible');
    await expect(busy).toHaveCount(0, { timeout });
  }

  /**
   * Opens a slide-over panel. The trigger is a toggle, so it is clicked once, never retried. The
   * panels carry `aria-hidden` while open, so role locators don't work inside them — use CSS ids.
   */
  protected async openOffcanvasPanel(trigger: Locator, panel: Locator, timeout = 30000): Promise<void> {
    await trigger.click();
    await panel.waitFor({ state: 'visible', timeout });
  }
}
