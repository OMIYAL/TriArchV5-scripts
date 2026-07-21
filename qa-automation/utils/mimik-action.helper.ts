import type { Locator, Page } from '@playwright/test';
import { isMimikGuideMode, waitForMimikCapture } from './mimik.helper';

export type GuideClickOptions = {
  force?: boolean;
  timeout?: number;
};

/** Mimik-friendly click: real click first, optional force fallback, then capture delay. */
export async function guideClick(
  page: Page,
  locator: Locator,
  options?: GuideClickOptions,
): Promise<void> {
  const timeout = options?.timeout ?? 15000;
  await locator.waitFor({ state: 'visible', timeout });

  if (!isMimikGuideMode()) {
    await locator.click({ force: options?.force ?? false, timeout });
    return;
  }

  await page.bringToFront();
  await locator.scrollIntoViewIfNeeded();

  if (options?.force) {
    await locator.click({ force: true, timeout });
  } else {
    try {
      await locator.click({ timeout });
    } catch {
      await locator.click({ force: true, timeout });
    }
  }

  await waitForMimikCapture(page);
}

export async function guideType(page: Page, locator: Locator, value: string): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout: 15000 });

  if (!isMimikGuideMode()) {
    await locator.clear();
    await locator.fill(value);
    return;
  }

  await page.bringToFront();
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
  await locator.fill(value);
  await waitForMimikCapture(page);
}
