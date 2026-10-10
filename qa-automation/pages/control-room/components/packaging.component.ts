import { Page, expect } from '@playwright/test';
import { BasePage } from '../../base.page';

export class PackagingComponent extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async completePackaging() {
    // 1. Quick exit if it's not a packaging step
    // Using .ta-pkg-stage as the reliable container for the packaging UI
    const pkgStage = this.page.locator('.ta-pkg-stage').first();
    if (!await pkgStage.isVisible({ timeout: 4000 }).catch(() => false)) {
      return; // Not a packaging step
    }

    console.log('Packaging step detected. Checking source files...');
    // Tab 1: Source Files -> Check all boxes
    const checkboxes = this.page.locator('.ta-pkg-stage input[type="checkbox"]');
    const count = await checkboxes.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const cb = checkboxes.nth(i);
      if (!await cb.isChecked().catch(() => true)) {
        // NOTE: force kept here — same custom-checkbox-styling reasoning as the checkbox
        // cases in general-review.component.ts / citizen.steps.ts / offcanvas-decision.
        await cb.check({ force: true }).catch(() => cb.locator('..').click({ force: true }));
        await this.waitForLoaders();
        // FIX: previously, if BOTH the check() and the fallback click() failed, the loop moved
        // on silently — the code would still proceed to click Merge with a source file left
        // unchecked, which could either merge an incomplete package or fail merge for reasons
        // that look unrelated to the actual root cause. Verify the real post-condition now.
        if (!await cb.isChecked().catch(() => false)) {
          throw new Error(`Packaging source-file checkbox at index ${i} failed to check and is still unchecked.`);
        }
      }
    }

    // Now the merge button must be visible — hard failure if it never appears, matching the
    // source-file checkbox throw above. Previously an else-branch logged and returned,
    // allowing a packaging step to pass without any merge happening.
    const mergeBtn = this.page.locator('#pkg-merge-btn').first();
    await expect(
      mergeBtn,
      'Merge & Continue button did not appear — packaging source files may not be checked or the UI failed to advance to the merge state.',
    ).toBeVisible({ timeout: 10000 });

    console.log('Clicking Merge & Continue...');
    await mergeBtn.click();
    await this.waitForLoaders();

    // Dismiss the "PDF Viewer — Web-service is not listening" modal if present.
    // Clicking OK causes the PDF to load; proceeding without dismissal means
    // Save & Next is clicked before the viewer ever renders (the modal is visually
    // blocking but does not prevent Playwright from interacting with DOM elements
    // underneath it — pkg-next-btn was previously clickable through the open modal).
    await this.dismissPdfViewerDialog();

    // Tab 2: Edit & Organize -> Save & Next
    console.log('Waiting for Edit & Organize tab (and document) to load...');
    const saveNextBtn = this.page.locator('#pkg-next-btn').first();

    let t0 = Date.now();
    await saveNextBtn.waitFor({ state: 'visible', timeout: 45000 });
    console.log(`[timing] pkg-next-btn became VISIBLE after ${Date.now() - t0}ms`);

    t0 = Date.now();
    // Hard failure — previously .then(true).catch(false) downgraded this to a boolean probe,
    // discarding the assertion error and its entry in the HTML report. A packaging step
    // whose Save & Next never enabled would silently pass.
    await expect(
      saveNextBtn,
      'Save & Next (#pkg-next-btn) never became enabled — PDF viewer may not have loaded or the Edit & Organize tab did not advance.',
    ).toBeEnabled({ timeout: 45000 });
    console.log(`[timing] pkg-next-btn became ENABLED after ${Date.now() - t0}ms`);

    // FIX: .click() has a built-in actionability wait (visible + stable + enabled +
    // "not obscured by another element") that runs SILENTLY inside the call — this is
    // very likely where the real 15-45s idle time is hiding, e.g. a "Loading document..."
    // spinner still sitting on top of the button after it reports visible/enabled.
    // Make that wait explicit and logged instead of opaque, and cap the click at 10s so a
    // genuine block shows up clearly rather than being silently absorbed for 30-45s.
    const stillBlocked = await this.page.evaluate((sel) => {
      const btn = document.querySelector(sel) as HTMLElement | null;
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      const topEl = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      if (!topEl) return null;
      if (topEl === btn || btn.contains(topEl)) return null;
      return topEl.outerHTML.slice(0, 200);
    }, '#pkg-next-btn').catch(() => null);
    if (stillBlocked) {
      console.log(`[blocker] Element covering #pkg-next-btn at click time: ${stillBlocked}`);
    }

    // t0 reset AFTER the page.evaluate probe so [timing] click() measures only the click,
    // not the evaluate round-trip (previously t0 was set before the evaluate call).
    t0 = Date.now();
    console.log('Clicking Save & Next...');
    await saveNextBtn.click({ timeout: 10000 }).catch(async (e) => {
      console.log(`[timing] click() actionability wait took ${Date.now() - t0}ms before failing: ${e.message}`);
      throw e;
    });
    console.log(`[timing] click() (including any internal actionability wait) took ${Date.now() - t0}ms`);

    t0 = Date.now();
    await this.waitForLoaders();
    console.log(`[timing] post-click loaders cleared after ${Date.now() - t0}ms`);

    // Same dialog may reappear when the viewer reloads for the Finalize tab.
    await this.dismissPdfViewerDialog();

    // Tab 3: Finalize -> Next
    console.log('Waiting for Finalize tab (and document) to load...');
    const finalizeNextBtn = this.page.locator('#pkg-finalize-next').first();

    t0 = Date.now();
    await finalizeNextBtn.waitFor({ state: 'visible', timeout: 45000 });
    console.log(`[timing] pkg-finalize-next became VISIBLE after ${Date.now() - t0}ms`);

    t0 = Date.now();
    // Hard failure — same silent-pass pattern as Save & Next above.
    await expect(
      finalizeNextBtn,
      'Finalize / Next (#pkg-finalize-next) never became enabled — PDF viewer may not have loaded or the Finalize tab did not advance.',
    ).toBeEnabled({ timeout: 45000 });
    console.log(`[timing] pkg-finalize-next became ENABLED after ${Date.now() - t0}ms`);

    const stillBlockedFinalize = await this.page.evaluate((sel) => {
      const btn = document.querySelector(sel) as HTMLElement | null;
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      const topEl = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      if (!topEl) return null;
      if (topEl === btn || btn.contains(topEl)) return null;
      return topEl.outerHTML.slice(0, 200);
    }, '#pkg-finalize-next').catch(() => null);
    if (stillBlockedFinalize) {
      console.log(`[blocker] Element covering #pkg-finalize-next at click time: ${stillBlockedFinalize}`);
    }

    // t0 reset AFTER the page.evaluate probe — same fix as the Save & Next block above.
    t0 = Date.now();
    console.log('Clicking Finalize / Next...');
    await finalizeNextBtn.click({ timeout: 10000 }).catch(async (e) => {
      console.log(`[timing] click() actionability wait took ${Date.now() - t0}ms before failing: ${e.message}`);
      throw e;
    });
    console.log(`[timing] click() (including any internal actionability wait) took ${Date.now() - t0}ms`);

    t0 = Date.now();
    await this.waitForLoaders();
    console.log(`[timing] post-finalize-click loaders cleared after ${Date.now() - t0}ms`);
    // Removed networkidle wait because it hangs the script for 30 seconds while the drawer is already open
  }

  /**
   * Dismisses the "PDF Viewer — Web-service is not listening" Bootstrap modal
   * if it is present, then waits for the PDF viewer to finish loading.
   *
   * Background: the Syncfusion PDF viewer in the packaging Edit & Organize and
   * Finalize tabs shows this modal when its background web service is unavailable.
   * Clicking OK causes the PDF to load. Without dismissal the modal is visually
   * blocking but Playwright can still interact with elements underneath it —
   * meaning Save & Next can be clicked before the PDF ever renders.
   *
   * No-op if the dialog is absent — safe to call unconditionally before each tab.
   */
  private async dismissPdfViewerDialog(): Promise<void> {
    const dialog = this.page.locator('.modal', { hasText: 'PDF Viewer' }).first();
    // waitFor({ state: 'visible' }) instead of isVisible({ timeout }) — isVisible()'s timeout
    // option is @deprecated and ignored in Playwright 1.59.1, making it a zero-wait snapshot
    // that routinely missed this modal (it renders from the merge/reload AJAX response).
    //
    // The timeout is deliberately short: unlike isVisible(), this blocks for the FULL timeout
    // on the healthy path where the web service is listening and no modal ever appears, and
    // this runs twice per packaging step. waitForLoaders() has already settled the DOM at both
    // call sites, so 2s is well past the modal's actual render time while keeping the cost of
    // the no-modal case low.
    const isVisible = await dialog.waitFor({ state: 'visible', timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (!isVisible) return;

    console.log('[packaging] PDF Viewer web-service dialog detected — clicking OK so viewer can load...');
    const okBtn = dialog.getByRole('button', { name: /^ok$/i });
    await okBtn.click({ timeout: 5000 });
    await dialog.waitFor({ state: 'hidden', timeout: 10000 });
    console.log('[packaging] PDF Viewer dialog dismissed — waiting for viewer to load...');

    // After OK the PDF viewer begins loading. #pkg-viewer-loading is already
    // tracked by BasePage.waitForLoaders(), so this waits for it to clear.
    await this.waitForLoaders();
    console.log('[packaging] PDF viewer loaded.');
  }
}
