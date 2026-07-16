import { Page } from '@playwright/test';

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
