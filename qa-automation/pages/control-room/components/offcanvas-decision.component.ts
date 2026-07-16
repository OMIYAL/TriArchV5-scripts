import { expect, Page, Locator } from '@playwright/test';
import { BasePage } from '../../base.page';

export class OffcanvasDecisionComponent extends BasePage {
  private readonly drawer: Locator;

  constructor(page: Page) {
    super(page);
    this.drawer = page.locator('#activity-verdict-drawer');
  }

  private get decisionBody() {
    // Look for offcanvas body or modal body, fallback to drawer itself
    return this.drawer.locator('.offcanvas-body, .modal-body, .drawer-body, #activity-verdict-drawer').first();
  }

  async submitDecision(decisionName?: string) {
    // Both General Review and Fee use #ActivityVerdictButton at the top to open the drawer.
    // The drawer does NOT auto-open — an explicit click is always needed.
    if (!await this.drawer.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Primary: #ActivityVerdictButton is the header "Submit Decision" button on ALL step types.
      const verdictBtn = this.page.locator('#ActivityVerdictButton');
      const fallbackBtn = this.page.locator('.ta-acthdr__submit-btn, button:has-text("Submit Decision")')
        .filter({ visible: true }).first();

      const btnToClick = await verdictBtn.isVisible({ timeout: 8000 }).catch(() => false)
        ? verdictBtn
        : await fallbackBtn.isVisible({ timeout: 3000 }).catch(() => false)
          ? fallbackBtn
          : null;

      if (btnToClick) {
        console.log('Clicking Submit Decision button to open decision drawer...');
        await btnToClick.click();
        await this.drawer.waitFor({ state: 'visible', timeout: 30000 });
      } else {
        // Should not reach here — means the page is in an unexpected state
        console.log('No Submit Decision button found. Waiting up to 30s for drawer...');
        await this.drawer.waitFor({ state: 'visible', timeout: 30000 });
      }
    }

    // Wait for the decision options to load and render inside the drawer body
    await this.decisionBody.locator('input, label, button, .card, [role="button"]').first()
      .waitFor({ state: 'attached', timeout: 15000 })
      .catch(() => { console.log('Warning: Decision options did not render within 15s.'); });

    // Safety net: if sections weren't fully cleared, the drawer shows BLOCKERS and the decision is locked.
    // Skip this check on Fee/Issuance/Certificate steps where clearing is not required.
    // Detect by checking if the 'Mark All Sections Reviewed' button exists anywhere on the page —
    // if it doesn't exist, this is a step that doesn't need clearing (Fee, Certificate, Issuance, etc.).
    const markAllBtn = this.page.getByRole('button', { name: /Mark All Sections Reviewed/i }).first();
    const requiresClearing = await markAllBtn.isVisible({ timeout: 1000 }).catch(() => false);

    if (requiresClearing) {
      const blockerText = this.drawer.getByText(/blocker|not yet cleared/i).first();
      if (await blockerText.isVisible({ timeout: 2000 }).catch(() => false)) {
        const msg = await blockerText.textContent().catch(() => '');
        throw new Error(`Decision blocked: ${msg?.trim() || 'sections not yet cleared'}. markAllCleared() must finish before submitDecision().`);
      }
    }

    let clicked = false;
    if (decisionName) {
      const decisionLabel = this.decisionBody.getByText(new RegExp(decisionName, 'i')).first();
      if (await decisionLabel.isVisible({ timeout: 5000 }).catch(() => false)) {
        await decisionLabel.click();
        clicked = true;
      }
    }

    if (!clicked) {
      const fallbackRegex = /Accept & route|Accept|Approve and Route|Approved|Approve|Payment confirmed|Issue certificate|Issue|Package|Generate|Complete|Done|Send|Clear|Review complete|Verify|Validate|Proceed|Confirm|Pass|Passed|Submit/i;
      const fallbackLabel = this.decisionBody.getByText(fallbackRegex).first();
      
      if (await fallbackLabel.isVisible({ timeout: 5000 }).catch(() => false)) {
        await fallbackLabel.click();
      } else {
        // Fallback to first option inside the body (radio buttons, labels, cards)
        const firstOption = this.decisionBody.locator('input[type="radio"], .form-check, label, .card, [role="button"]').first();
        if (await firstOption.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstOption.click();
        } else {
          throw new Error('No decisions available at all in the drawer.');
        }
      }
    }


    const confirmLabel = this.drawer.getByText(/I confirm this action/i).first();
    if (await confirmLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmLabel.click();
    }

    const finalSubmitButton = this.page.locator('#SubmitVerdictButton');
    await finalSubmitButton.waitFor({ state: 'visible', timeout: 20000 });
    await expect(finalSubmitButton).toBeEnabled({ timeout: 20000 });
    await finalSubmitButton.click({ timeout: 30000 });
    await this.waitForLoaders();
  }
}
