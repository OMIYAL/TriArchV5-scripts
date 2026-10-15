import { Page, Locator } from '@playwright/test';
import { BuildRoomBasePage } from '../base.page';
import { generateBidDecisionReason } from '../../../utils/data-generator.helper';

/**
 * Bid decision offcanvas on project detail.
 * Opened via the "Bid decision" toolbar button; scoped to `#BidDecisionPanel`.
 */
export class BidDecisionComponent extends BuildRoomBasePage {
  readonly panel: Locator;
  private readonly openButton: Locator;
  private readonly goButton: Locator;
  private readonly reasonInput: Locator;
  private readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.panel      = page.locator('#BidDecisionPanel');
    // Use the data-bs-target attribute — the toolbar button has no stable id across projects
    this.openButton = page.locator('[data-bs-target="#BidDecisionPanel"]');
    // data-decision="1" is the Go button; data-decision="2" is No go — more reliable than text
    this.goButton   = this.panel.locator('button[data-decision="1"]');
    this.reasonInput = page.locator('#BidDecisionReasonInput');
    this.saveButton  = page.locator('#BidDecisionConfirm');
  }

  /** Click Bid decision → Go → fill reason → Save. */
  async recordGoDecision(): Promise<void> {
    // Explicit wait before click — actionTimeout is only 15s; same pattern as launchPhaseButton
    await this.openButton.waitFor({ state: 'visible', timeout: 30000 });
    await this.openOffcanvasPanel(this.openButton, this.panel);
    await this.goButton.waitFor({ state: 'visible', timeout: 30000 });
    await this.goButton.click();
    await this.reasonInput.fill(generateBidDecisionReason());
    await this.saveButton.click();
    await this.confirmYes();
    await this.panel.waitFor({ state: 'hidden', timeout: 30000 });
  }
}
