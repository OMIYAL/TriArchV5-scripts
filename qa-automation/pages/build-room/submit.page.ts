import { Page, Locator, expect } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';

/**
 * Submit stage (`...&stage=submit`): four contractor attestations, then "Submit bid". Both Submit
 * buttons stay disabled until the checklist is complete. Submitting locks the bid PDF, files the
 * attestations to the audit log and starts the bid tracker. The submission method dropdown is
 * left on its default.
 */
export class SubmitPage extends BuildRoomBasePage {
  readonly submitBidButton: Locator;
  readonly bidSubmittedBanner: Locator;

  constructor(page: Page) {
    super(page);
    this.submitBidButton = page.locator('#SubmitBidCardBtn');
    this.bidSubmittedBanner = page.locator('text=Bid submitted').first();
  }

  /** The four contractor attestations. `#AckPricingRisk` is a separate acknowledgement. */
  private attestationBoxes(): Locator {
    return this.page.locator('input.br-sub__attest-cb');
  }

  /** `force` because the inputs are styled custom checkboxes. */
  async tickAllAttestations(): Promise<void> {
    const boxes = this.attestationBoxes();
    await boxes.first().waitFor({ state: 'attached', timeout: 15000 });
    const count = await boxes.count();
    for (let i = 0; i < count; i++) {
      await boxes.nth(i).check({ force: true });
    }
    const pricingRisk = this.page.locator('#AckPricingRisk');
    if ((await pricingRisk.count()) > 0) {
      await pricingRisk.check({ force: true });
    }
  }

  /** Presses Submit bid (handling a "Yes" confirm if one appears) and waits for the banner. */
  async submitBid(): Promise<void> {
    await expect(this.submitBidButton).toBeEnabled({ timeout: 30000 });
    await this.submitBidButton.click();
    const yes = this.page.getByRole('button', { name: 'Yes', exact: true });
    if (await yes.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
      await yes.click();
    }
    await this.bidSubmittedBanner.waitFor({ state: 'visible', timeout: 60000 });
  }
}
