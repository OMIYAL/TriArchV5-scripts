import { Page } from '@playwright/test';
import { BasePage } from '../../base.page';

export class PackagingComponent extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async completePackaging() {
    const mergeBtn = this.page.getByRole('button', { name: /Merge & Continue/i }).first();
    if (!await mergeBtn.isVisible({ timeout: 2000 }).catch(() => false)) return;

    const checkboxes = this.page.locator('input[type="checkbox"]');
    const count = await checkboxes.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const cb = checkboxes.nth(i);
      if (!await cb.isChecked().catch(() => true)) {
        await cb.check().catch(() => cb.locator('..').click().catch(() => {}));
        await this.waitForLoaders();
      }
    }

    if (await this.safeClick(mergeBtn, 3000)) {
      await this.waitForLoaders();

      for (const name of [/Save & Next/i, /^Next$/]) {
        const btn = this.page.getByRole('button', { name }).first();
        if (await this.safeClick(btn, 3000)) {
          await this.waitForLoaders();
          await this.page.waitForLoadState('networkidle').catch(() => { });
        }
      }
    }
  }
}
