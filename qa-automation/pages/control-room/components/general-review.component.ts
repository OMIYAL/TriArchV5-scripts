import { Page } from '@playwright/test';
import { BasePage } from '../../base.page';
import { scrollFromTop } from '../../../utils/scroll.helper';

export class GeneralReviewComponent extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async markAllCleared() {
    await scrollFromTop(this.page);

    const looseCheckboxes = this.page.locator('.ta-activity-shell input[type="checkbox"]:not(:checked)');
    const checkboxCount = await looseCheckboxes.count();
    if (checkboxCount > 0) {
      console.log(`Found ${checkboxCount} unchecked section checkboxes. Checking them...`);
      for (let i = 0; i < checkboxCount; i++) {
        const box = looseCheckboxes.nth(i);
        if (await box.isVisible().catch(() => false) && await box.isEnabled().catch(() => false)) {
          // NOTE: force kept here deliberately — these are often native checkbox inputs hidden
          // behind custom-styled label overlays, which genuinely fail Playwright's "visible"
          // actionability check even though a user can click them via the visible label. Unlike
          // the button clicks below, this isn't a lazy default — but worth confirming with the
          // team whether clicking the associated <label> instead would remove the need for force.
          await box.check({ force: true });
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
        // FIX: removed default force — these are real <button> elements, not hidden inputs
        // behind custom styling, so there's no known reason they'd need actionability bypassed.
        // If one is genuinely covered by something, that's worth seeing as a real failure.
        if (await box.isVisible().catch(() => false) && await box.isEnabled().catch(() => false)) {
          await box.click();
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
        // FIX: removed default force — same reasoning as above.
        await btn.click();
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
      await swalOk.click();
      await this.waitForLoaders();
    }

    const clearAllBtn = this.page.getByRole('button', { name: /Mark All Sections Reviewed/i }).first();
    // Use count() first — isVisible() with a timeout wastes 5s on steps without this button (Fee, etc.)
    if (await clearAllBtn.count() === 0 || !await clearAllBtn.isVisible({ timeout: 1000 }).catch(() => false)) return;

    console.log('Clicking "Mark All Sections Reviewed" button...');
    // FIX: removed default force — this is a plain button; no documented reason for it here.
    await clearAllBtn.click();
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

  async completeGeneralReview() {
    console.log('General Review step — scrolling down to find "Mark All Sections Reviewed" button...');

    // Scroll to the bottom so the button is fully in view.
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    const clearAllBtn = this.page.getByRole('button', { name: /Mark All Sections Reviewed/i }).first();
    // FIX: removed the fixed 1000ms "let the scroll settle" sleep. scrollTo is synchronous —
    // there's nothing to wait for from the scroll itself. The real uncertainty is whether the
    // button has rendered yet, which is exactly what this waitFor already checks; it now does
    // the actual waiting instead of a blind pause beforehand.
    if (await clearAllBtn.count() === 0 || !await clearAllBtn.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
      console.log('Warning: "Mark All Sections Reviewed" button not found — page may not be a General Review step.');
      return;
    }

    await clearAllBtn.scrollIntoViewIfNeeded();
    console.log('Clicking "Mark All Sections Reviewed" button...');
    // FIX: removed default force — same reasoning as markAllCleared() above.
    await clearAllBtn.click();

    // FIX: removed the fixed 2000ms "wait for server to register" sleep. The very next line
    // already waits for the real completion signal ("All clear" text) with its own timeout —
    // the fixed sleep beforehand only added dead time on every run regardless of how fast the
    // server actually responded.
    await this.waitForLoaders();

    // Confirm the server registered — "All clear" should appear.
    const isAllClear = await this.page.getByText(/All clear/i)
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);

    if (!isAllClear) {
      console.log('"All clear" not confirmed after first click. Retrying via JS click...');
      await this.page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(
          b => /Mark All Sections Reviewed/i.test(b.textContent || '')
        );
        if (btn) (btn as HTMLElement).click();
      });
      // FIX: same as above — removed the fixed 2000ms sleep; the waitFor below is the real wait.
      await this.waitForLoaders();
      await this.page.getByText(/All clear/i)
        .waitFor({ state: 'visible', timeout: 15000 })
        .catch(() => { console.log('Warning: "All clear" not visible within 15s, proceeding...'); });
    } else {
      console.log('All sections confirmed as cleared by server.');
    }
  }
}
