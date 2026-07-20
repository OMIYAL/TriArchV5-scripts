import { Page } from '@playwright/test';
import { BasePage } from '../../base.page';

export class PackagingComponent extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async completePackaging() {
    // Quick exit if it's not a packaging step
    // Check if the merge button is at least attached to the DOM (it may be hidden until boxes are checked)
    const mergeBtn = this.page.locator('#pkg-merge-btn').first();
    if (!await mergeBtn.waitFor({ state: 'attached', timeout: 3000 }).catch(() => false)) {
      return; // Not a packaging step
    }

    // Tab 1: Source Files -> Check all boxes
    const checkboxes = this.page.locator('input[type="checkbox"]');
    const count = await checkboxes.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const cb = checkboxes.nth(i);
      if (!await cb.isChecked().catch(() => true)) {
        await cb.check().catch(() => cb.locator('..').click().catch(() => {}));
        await this.waitForLoaders();
      }
    }

    // Now the merge button should be visible/enabled
    if (await mergeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.safeClick(mergeBtn, 3000);
      await this.waitForLoaders();

      // Tab 2: Edit & Organize -> Save & Next
      const saveNextBtn = this.page.locator('#pkg-next-btn');
      if (await saveNextBtn.isVisible({ timeout: 20000 }).catch(() => false)) {
        await saveNextBtn.click({ force: true });
        await this.waitForLoaders();
      }

      // Tab 3: Finalize -> Next
      const finalizeNextBtn = this.page.locator('#pkg-finalize-next');
      if (await finalizeNextBtn.isVisible({ timeout: 20000 }).catch(() => false)) {
        await finalizeNextBtn.click({ force: true });
        await this.waitForLoaders();
        await this.page.waitForLoadState('networkidle').catch(() => { });
      }
    }
  }
}
