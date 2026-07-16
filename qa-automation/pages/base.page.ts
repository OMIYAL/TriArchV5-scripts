import { Page, Locator, expect } from '@playwright/test';

export class BasePage {
  protected page: Page;
  protected baseUrl: string;

  constructor(page: Page, baseUrl: string = '') {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async waitForLoaders(timeout = 60000) {
    const loaders = this.page.locator('.ta-stage-loading, #ta-doc-review-loading, #pkg-viewer-loading, .abp-block-area, .abp-block-area-busy');
    await expect(loaders).toHaveCount(0, { timeout }).catch(() => {});
  }

  async safeClick(locator: Locator, timeout: number = 10000): Promise<boolean> {
    if (await locator.isVisible({ timeout }).catch(() => false)) {
      await locator.click({ force: true }).catch(() => {});
      return true;
    }
    return false;
  }

  async safeHover(locator: Locator, timeout: number = 10000): Promise<boolean> {
    if (await locator.isVisible({ timeout }).catch(() => false)) {
      await locator.hover({ force: true }).catch(() => {});
      return true;
    }
    return false;
  }

  async goto(path: string = '', queryParams?: Record<string, string>): Promise<void> {
    let url = `${this.baseUrl}${path}`;
    if (queryParams) {
      const params = new URLSearchParams(queryParams).toString();
      url += `?${params}`;
    }
    await this.page.goto(url);
  }

  async waitForNetworkIdle(timeout: number = 5000): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout }).catch(() => {
      console.log(`⚠️ Warning: networkidle state not reached within ${timeout}ms, continuing...`);
    });
  }

  async waitForUrl(pattern: string | RegExp, timeout: number = 30000): Promise<void> {
    await this.page.waitForURL(pattern, { timeout });
  }

  getCurrentUrl(): string {
    return this.page.url();
  }

  protected async click(locator: Locator, timeout: number = 10000): Promise<void> {
    await locator.waitFor({ state: 'visible', timeout });
    await locator.click();
  }

  protected async fill(locator: Locator, value: string, timeout: number = 10000): Promise<void> {
    await locator.waitFor({ state: 'visible', timeout });
    await locator.clear();
    await locator.fill(value);
  }

  protected async selectOption(locator: Locator, value: string): Promise<void> {
    await locator.waitFor({ state: 'visible' });
    await locator.selectOption(value);
  }
}