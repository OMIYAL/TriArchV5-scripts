import { Page, Locator } from '@playwright/test';

export class BasePage {
  protected page: Page;
  protected baseUrl: string;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  async goto(path: string = '', queryParams?: Record<string, string>): Promise<void> {
    let url = `${this.baseUrl}${path}`;
    if (queryParams) {
      const params = new URLSearchParams(queryParams).toString();
      url += `?${params}`;
    }
    // Mimik's all_urls content script can delay/block the full "load" event.
    if (process.env.MIMIK_GUIDE === '1') {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
      return;
    }
    await this.page.goto(url);
  }

  /** waitForURL options — under Mimik, stop at commit so we don't hang on "load". */
  protected urlWait(timeout: number = 60000): { timeout: number; waitUntil?: 'commit' } {
    if (process.env.MIMIK_GUIDE === '1') {
      return { timeout, waitUntil: 'commit' };
    }
    return { timeout };
  }

  async waitForNetworkIdle(timeout: number = 5000): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout }).catch(() => {
      console.log(`⚠️ Warning: networkidle state not reached within ${timeout}ms, continuing...`);
    });
  }

  async waitForUrl(pattern: string | RegExp, timeout: number = 30000): Promise<void> {
    await this.page.waitForURL(pattern, this.urlWait(timeout));
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