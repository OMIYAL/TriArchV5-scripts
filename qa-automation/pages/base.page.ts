import { Page, Locator, expect } from '@playwright/test';

export class BasePage {
  protected page: Page;
  protected baseUrl: string;

  constructor(page: Page, baseUrl: string = '') {
    this.page = page;
    this.baseUrl = baseUrl;
  }

async waitForLoaders(timeout = 60000) {
  const start = Date.now();
  const remaining = () => Math.max(1000, timeout - (Date.now() - start));

  const scopedLoaders = this.page.locator(
    '.ta-stage-loading:visible, #ta-doc-review-loading:visible, #pkg-viewer-loading:visible'
  );
  const busyOverlay = this.page.locator('.abp-block-area-busy');
  const textOverlay = this.page.getByText(/Opening service request|Loading details|Loading document/i);

  // Same underlying bug as .abp-block-area-busy, just a different element: a block/unblock
  // (or show/hide) counter getting left "on" after the real work is done. #pkg-viewer-loading
  // specifically only exists in the packaging tabs, which reload the package viewer in-place
  // (AJAX, not a full nav) up to 3x per activity — that's why this only ever shows up here.
  // Short leash + network-idle stale check, same budget shared across both checks so one
  // stuck loader can't independently re-claim a full 60s.
  const shortLeashThenCheck = async (waitPromiseFactory: (t: number) => Promise<any>, label: string) => {
    await waitPromiseFactory(remaining());
  };

  await shortLeashThenCheck(
    (t) => busyOverlay.waitFor({ state: 'hidden', timeout: t }),
    '.abp-block-area-busy'
  );

  // Check the two scoped loaders individually (not as one combined Promise.all) so
  // your logs tell you WHICH one was stuck — that's the evidence you need to hand
  // the ControlRoom shell owner a precise repro instead of "packaging sometimes hangs."
  await shortLeashThenCheck(
    (t) => expect(scopedLoaders).toHaveCount(0, { timeout: t }),
    'scoped loaders (.ta-stage-loading/#ta-doc-review-loading/#pkg-viewer-loading)'
  );

  await shortLeashThenCheck(
    (t) => textOverlay.waitFor({ state: 'hidden', timeout: t }),
    'text overlay (Opening service request/Loading details/Loading document)'
  );
}

  /**
   * Waits for a specific network response to complete (matched by a URL substring or regex),
   * and logs how long it actually took. Use this instead of blind fixed-length waits whenever
   * a step's real bottleneck is a slow backend call (e.g. Detail?id=..., submit-decision) —
   * this waits exactly as long as the server takes, no more, no less, and surfaces the true
   * duration in your console/CI output instead of hiding it inside an opaque delay.
   *
   * Call this BEFORE triggering the action that fires the request (e.g. before clicking the
   * button that navigates), since Playwright needs to start listening before the response fires.
   */
  async waitForNetworkResponse(
    urlMatch: string | RegExp,
    triggerAction: () => Promise<void>,
    timeout = 60000
  ): Promise<void> {
    const label = typeof urlMatch === 'string' ? urlMatch : urlMatch.toString();
    const t0 = Date.now();
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) => (typeof urlMatch === 'string' ? res.url().includes(urlMatch) : urlMatch.test(res.url())),
        { timeout }
      ).catch((e) => {
        console.log(`[timing] waitForNetworkResponse(${label}) TIMED OUT after ${Date.now() - t0}ms`);
        throw e;
      }),
      triggerAction(),
    ]);
    console.log(`[timing] ${label} responded with ${response.status()} after ${Date.now() - t0}ms`);
  }

  async safeClick(locator: Locator, timeout: number = 10000): Promise<boolean> {
    if (!await locator.isVisible({ timeout }).catch(() => false)) return false;
    await locator.click({ timeout });
    return true;
  }

  async safeHover(locator: Locator, timeout: number = 10000): Promise<boolean> {
    if (!await locator.isVisible({ timeout }).catch(() => false)) return false;
    await locator.hover({ timeout });
    return true;
  }

  async goto(path: string = '', queryParams?: Record<string, string>): Promise<void> {
    let url = `${this.baseUrl}${path}`;
    if (queryParams) {
      const params = new URLSearchParams(queryParams).toString();
      url += `?${params}`;
    }
    await this.page.goto(url);
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
