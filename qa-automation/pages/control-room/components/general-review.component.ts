import { Page } from '@playwright/test';
import { BasePage } from '../../base.page';
import { scrollFromTop } from '../../../utils/scroll.helper';

export class GeneralReviewComponent extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async markAllCleared() {
    await scrollFromTop(this.page).catch(() => { });

    const looseCheckboxes = this.page.locator('.ta-activity-shell input[type="checkbox"]:not(:checked)');
    const checkboxCount = await looseCheckboxes.count();
    if (checkboxCount > 0) {
      console.log(`Found ${checkboxCount} unchecked section checkboxes. Checking them...`);
      for (let i = 0; i < checkboxCount; i++) {
        const box = looseCheckboxes.nth(i);
        if (await box.isVisible().catch(() => false) && await box.isEnabled().catch(() => false)) {
          await box.check({ force: true }).catch(() => {});
          await this.waitForLoaders();
        }
      }
    }

    // Fee / Issuance criterion checklists use button attest boxes (.js-attest), not checkboxes.
    // Skip disabled ones (e.g. payment_reconciled while awaiting payment — those are resolved via Waive fee).
    const attestBoxes = this.page.locator('.ta-activity-shell button.js-attest[aria-pressed="false"]:not([disabled])');
    const attestCount = await attestBoxes.count();
    if (attestCount > 0) {
      console.log(`Found ${attestCount} unattested criterion boxes. Clicking them...`);
      for (let i = 0; i < attestCount; i++) {
        const box = attestBoxes.nth(i);
        if (await box.isVisible().catch(() => false) && await box.isEnabled().catch(() => false)) {
          await box.click({ force: true }).catch(() => {});
          await this.waitForLoaders();
        }
      }
    }

    // Issuance / section-level clear buttons (e.g. "Mark section reviewed", "Output package reviewed")
    const sectionClearBtns = this.page.getByRole('button', {
      name: /Mark section reviewed|Output package reviewed/i,
    });
    const sectionClearCount = await sectionClearBtns.count();
    for (let i = 0; i < sectionClearCount; i++) {
      const btn = sectionClearBtns.nth(i);
      if (await btn.isVisible({ timeout: 500 }).catch(() => false) && await btn.isEnabled().catch(() => false)) {
        console.log(`Clicking section clear button: ${(await btn.textContent().catch(() => ''))?.trim()}`);
        await btn.click({ force: true }).catch(() => {});
        await this.waitForLoaders();
      }
    }

    // If sections are already cleared, skip to avoid double-submit concurrency conflicts.
    if (await this.page.getByText(/All clear|Positive decision unlocked/i).isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Sections are already all clear. Skipping "Mark All Sections Reviewed" button click.');
      return;
    }

    // Dismiss any error alerts/modals (like Swal2 concurrency popups) before clicking
    const swalOk = this.page.locator('.swal2-confirm').first();
    if (await swalOk.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Detected concurrency alert, clicking OK to dismiss...');
      await swalOk.click().catch(() => { });
      await this.waitForLoaders();
    }

    const clearAllBtn = this.page.getByRole('button', { name: /Mark All Sections Reviewed/i }).first();
    // Use count() first — isVisible() with a timeout wastes 5s on steps without this button (Fee, etc.)
    if (await clearAllBtn.count() === 0 || !await clearAllBtn.isVisible({ timeout: 1000 }).catch(() => false)) return;

    console.log('Clicking "Mark All Sections Reviewed" button...');
    await clearAllBtn.click({ force: true });
    await this.waitForLoaders();

    // Verify the server registered the action — "All clear" text should appear.
    const isAllClear = await this.page.getByText(/All clear/i)
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    if (!isAllClear) {
      // Server may not have processed the first click — retry once with a JS click as fallback
      console.log('"All clear" not confirmed after first click. Retrying via JS click...');
      await this.page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(
          b => /Mark All Sections Reviewed/i.test(b.textContent || '')
        );
        if (btn) (btn as HTMLElement).click();
      });
      await this.waitForLoaders();
      console.log('Waiting for all sections to be confirmed as cleared by server...');
      await this.page.getByText(/All clear/i)
        .waitFor({ state: 'visible', timeout: 15000 })
        .catch(() => { console.log('Warning: "All clear" confirmation not visible within 15s, proceeding...'); });
    } else {
      console.log('All sections confirmed as cleared.');
    }
  }

  async completeGeneralReview() { await this.markAllCleared(); }
}
