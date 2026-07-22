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

    // Now the merge button should be visible/enabled
    const mergeBtn = this.page.locator('#pkg-merge-btn').first();
    if (await mergeBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('Clicking Merge & Continue...');
      await mergeBtn.click();
      await this.waitForLoaders();

      // Tab 2: Edit & Organize -> Save & Next
      console.log('Waiting for Edit & Organize tab (and document) to load...');
      const saveNextBtn = this.page.locator('#pkg-next-btn').first();

      let t0 = Date.now();
      await saveNextBtn.waitFor({ state: 'visible', timeout: 45000 });
      console.log(`[timing] pkg-next-btn became VISIBLE after ${Date.now() - t0}ms`);

      t0 = Date.now();
      const nextEnabled = await expect(saveNextBtn).toBeEnabled({ timeout: 45000 })
        .then(() => true)
        .catch(() => false);
      console.log(`[timing] pkg-next-btn became ENABLED after ${Date.now() - t0}ms (enabled=${nextEnabled})`);

      if (nextEnabled && await saveNextBtn.isVisible().catch(() => false)) {
        // FIX: .click() has a built-in actionability wait (visible + stable + enabled +
        // "not obscured by another element") that runs SILENTLY inside the call — this is
        // very likely where the real 15-45s idle time is hiding, e.g. a "Loading document..."
        // spinner still sitting on top of the button after it reports visible/enabled.
        // Make that wait explicit and logged instead of opaque, and fail fast (5s) so a
        // genuine block shows up clearly rather than being silently absorbed for 30-45s.
        t0 = Date.now();
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

        console.log('Clicking Save & Next...');
        await saveNextBtn.click({ timeout: 10000 }).catch(async (e) => {
          console.log(`[timing] click() actionability wait took ${Date.now() - t0}ms before failing: ${e.message}`);
          throw e;
        });
        console.log(`[timing] click() (including any internal actionability wait) took ${Date.now() - t0}ms`);

        t0 = Date.now();
        await this.waitForLoaders();
        console.log(`[timing] post-click loaders cleared after ${Date.now() - t0}ms`);
      } else {
        console.log('Save & Next button never became enabled within timeout.');
      }

      // Tab 3: Finalize -> Next
      console.log('Waiting for Finalize tab (and document) to load...');
      const finalizeNextBtn = this.page.locator('#pkg-finalize-next').first();

      t0 = Date.now();
      await finalizeNextBtn.waitFor({ state: 'visible', timeout: 45000 });
      console.log(`[timing] pkg-finalize-next became VISIBLE after ${Date.now() - t0}ms`);

      t0 = Date.now();
      const finalizeEnabled = await expect(finalizeNextBtn).toBeEnabled({ timeout: 45000 })
        .then(() => true)
        .catch(() => false);
      console.log(`[timing] pkg-finalize-next became ENABLED after ${Date.now() - t0}ms (enabled=${finalizeEnabled})`);

      if (finalizeEnabled && await finalizeNextBtn.isVisible().catch(() => false)) {
        t0 = Date.now();
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
      } else {
        console.log('Finalize/Next button never became enabled within timeout.');
      }
    } else {
      console.log('Merge button never became visible. Cannot proceed with packaging.');
    }
  }
}
