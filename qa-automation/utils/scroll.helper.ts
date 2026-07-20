import { Page, Locator } from '@playwright/test';

/** Scrolls the page from top to bottom gradually so lazy-rendered content (e.g. sticky bottom bars) becomes visible. */
export async function scrollFromTop(page: Page, stepPx = 300, delayMs = 100): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));

  // Null-safe: document.body can be null during Angular mid-route transitions
  const totalHeight: number = await page.evaluate(
    () => document.body?.scrollHeight ?? document.documentElement?.scrollHeight ?? 0
  );
  let scrolled = 0;

  while (scrolled < totalHeight) {
    scrolled += stepPx;
    await page.evaluate((y: number) => window.scrollTo(0, y), scrolled);
    await page.waitForTimeout(delayMs);
  }

  // Ensure we reach the very bottom
  await page.evaluate(
    () => window.scrollTo(0, document.body?.scrollHeight ?? document.documentElement?.scrollHeight ?? 0)
  );
  await page.waitForTimeout(delayMs);
}

/**
 * Scrolls a specific overflow container (e.g. an offcanvas body) to its bottom
 * step-by-step so that lazy-loaded content (reviewer names, list items) is
 * rendered by the server before the caller proceeds.
 *
 * @param container  Locator pointing to the scrollable element (overflow-y: auto/scroll).
 * @param page       Playwright Page — needed for waitForTimeout.
 * @param stepPx     Pixels to advance per scroll step (default 300).
 * @param settleMs   Extra wait after reaching the bottom for the server to load items (default 2000).
 */
export async function scrollElementToBottom(
  container: Locator,
  page: Page,
  stepPx = 300,
  settleMs = 2000,
): Promise<void> {
  const totalHeight: number = await container.evaluate(
    (el: Element) => (el as HTMLElement).scrollHeight
  ).catch(() => 0);

  let scrolled = 0;
  while (scrolled < totalHeight) {
    scrolled += stepPx;
    await container.evaluate(
      (el: Element, y: number) => { (el as HTMLElement).scrollTop = y; },
      scrolled
    );
    await page.waitForTimeout(100);
  }

  // Ensure we land exactly at the bottom
  await container.evaluate(
    (el: Element) => { (el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight; }
  );

  // Wait for the server to finish loading lazy items (reviewer names etc.)
  await page.waitForTimeout(settleMs);
}

