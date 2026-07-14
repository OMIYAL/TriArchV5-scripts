import { Page } from '@playwright/test';

export async function scrollFromTop(page: Page, stepPx = 300, delayMs = 100): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));

  const totalHeight: number = await page.evaluate(() => document.body.scrollHeight);
  let scrolled = 0;

  while (scrolled < totalHeight) {
    scrolled += stepPx;
    await page.evaluate((y: number) => window.scrollTo(0, y), scrolled);
    await page.waitForTimeout(delayMs);
  }

  // Ensure we reach the very bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(delayMs);
}
