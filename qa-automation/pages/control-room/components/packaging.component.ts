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
        await cb.check({ force: true }).catch(() => cb.locator('..').click({ force: true }).catch(() => { }));
        await this.waitForLoaders();
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
      await saveNextBtn.waitFor({ state: 'visible', timeout: 45000 }).catch(() => { });

      // FIX: Replaced the manual 2s-interval isDisabled() polling loop (up to 30s of dead
      // time even after the button was ready) with expect().toBeEnabled(). Playwright's
      // built-in assertion polling checks far more frequently (~every 100-500ms) and
      // resolves the instant the button becomes enabled, instead of waiting for the next
      // fixed 2-second tick. Timeout ceiling kept the same (30s) so real backend/merge
      // latency is still tolerated — only the wasted polling granularity is removed.
      const nextEnabled = await expect(saveNextBtn).toBeEnabled({ timeout: 30000 })
        .then(() => true)
        .catch(() => false);

      if (nextEnabled && await saveNextBtn.isVisible().catch(() => false)) {
        console.log('Clicking Save & Next...');
        await saveNextBtn.click();
        await this.waitForLoaders();
      } else {
        console.log('Save & Next button never became enabled within timeout.');
      }

      // Tab 3: Finalize -> Next
      console.log('Waiting for Finalize tab (and document) to load...');
      const finalizeNextBtn = this.page.locator('#pkg-finalize-next').first();
      await finalizeNextBtn.waitFor({ state: 'visible', timeout: 45000 }).catch(() => { });

      // Same fix applied here — see comment above.
      const finalizeEnabled = await expect(finalizeNextBtn).toBeEnabled({ timeout: 30000 })
        .then(() => true)
        .catch(() => false);

      if (finalizeEnabled && await finalizeNextBtn.isVisible().catch(() => false)) {
        console.log('Clicking Finalize / Next...');
        await finalizeNextBtn.click();
        await this.waitForLoaders();
        // Removed networkidle wait because it hangs the script for 30 seconds while the drawer is already open
      } else {
        console.log('Finalize/Next button never became enabled within timeout.');
      }
    } else {
      console.log('Merge button never became visible. Cannot proceed with packaging.');
    }
  }
}