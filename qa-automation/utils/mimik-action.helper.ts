import type { Locator, Page } from '@playwright/test';
import { drainMimikCapture, isMimikGuideMode, waitForMimikCapture } from './mimik.helper';

export type GuideClickOptions = {
  force?: boolean;
  timeout?: number;
  /** Prefer true for buttons that navigate — Mimik must screenshot before unload. */
  noWaitAfter?: boolean;
};

/** Real click + capture pause so Mimik records the step. */
export async function guideClick(
  page: Page,
  locator: Locator,
  options?: GuideClickOptions,
): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout: options?.timeout });

  if (!isMimikGuideMode()) {
    await locator.click({
      force: options?.force ?? false,
      timeout: options?.timeout,
      noWaitAfter: options?.noWaitAfter,
    });
    return;
  }

  await page.bringToFront().catch(() => {});
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  // noWaitAfter so navigation cannot race past the capture pause.
  await locator.click({
    force: options?.force ?? false,
    timeout: options?.timeout,
    noWaitAfter: true,
  });
  // Navigating clicks need a longer drain — Mimik screenshots before unload on a serial queue.
  if (options?.noWaitAfter) await drainMimikCapture(page);
  else await waitForMimikCapture(page);
}

/**
 * Focus → fill → blur → drain (no prior click — Mimik would duplicate InputSessions).
 */
export async function guideType(page: Page, locator: Locator, value: string): Promise<void> {
  await locator.waitFor({ state: 'visible' });

  if (!isMimikGuideMode()) {
    await locator.clear();
    await locator.fill(value);
    return;
  }

  await page.bringToFront().catch(() => {});
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  // No prior click — Mimik would start two InputSessions (click + fill).
  await locator.focus();
  await locator.fill(value);
  await locator.blur().catch(() => {});
  await drainMimikCapture(page);
}
