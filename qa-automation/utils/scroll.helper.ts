import { Page, Locator } from '@playwright/test';

/**
 * Waits until no DOM mutations have occurred within a container for `quietMs`,
 * capped at `timeoutMs` total. Replaces "wait N ms and hope the server finished
 * loading lazy content" with an actual signal: the DOM has genuinely stopped changing.
 */
async function waitForDomQuiet(target: Locator | Page, quietMs = 500, timeoutMs = 8000): Promise<void> {
  const isLocator = typeof (target as Locator).elementHandle === 'function';
  const page: Page = isLocator ? (target as Locator).page() : (target as Page);
  const el = isLocator ? await (target as Locator).elementHandle().catch(() => null) : null;

  await page.evaluate(
    ({ el, quiet, timeout }: { el: Element | null; quiet: number; timeout: number }) => {
      return new Promise<void>((resolve) => {
        const root = el ?? document.body;
        let timer: ReturnType<typeof setTimeout>;
        const done = () => { observer.disconnect(); resolve(); };
        const reset = () => { clearTimeout(timer); timer = setTimeout(done, quiet); };
        const observer = new MutationObserver(reset);
        observer.observe(root, { childList: true, subtree: true, attributes: true });
        reset();
        setTimeout(done, timeout);
      });
    },
    { el, quiet: quietMs, timeout: timeoutMs }
  );
}

/** Scrolls the page from top to bottom gradually so lazy-rendered content (e.g. sticky bottom bars) becomes visible. */
export async function scrollFromTop(page: Page, stepPx = 300, delayMs = 100): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));

  // Null-safe: document.body can be null during Angular mid-route transitions
  const totalHeight: number = await page.evaluate(
    () => document.body?.scrollHeight ?? document.documentElement?.scrollHeight ?? 0
  );
  let scrolled = 0;

  // NOTE: this per-step delay paces an animation-triggered lazy-load (e.g. IntersectionObserver
  // content), not "hope the last action finished" — there's no single element to wait on
  // mid-scroll, so it's left as intentional pacing rather than a correctness anti-pattern.
  while (scrolled < totalHeight) {
    scrolled += stepPx;
    await page.evaluate((y: number) => window.scrollTo(0, y), scrolled);
    await page.waitForTimeout(delayMs);
  }

  // Ensure we reach the very bottom
  await page.evaluate(
    () => window.scrollTo(0, document.body?.scrollHeight ?? document.documentElement?.scrollHeight ?? 0)
  );
  // FIX: replaced fixed settle sleep with a real "DOM has stopped changing" signal.
  await waitForDomQuiet(page, 300, 3000);
}

/**
 * Scrolls a specific overflow container (e.g. an offcanvas body) to its bottom
 * step-by-step so that lazy-loaded content (reviewer names, list items) is
 * rendered by the server before the caller proceeds.
 *
 * @param container  Locator pointing to the scrollable element (overflow-y: auto/scroll).
 * @param page       Playwright Page — needed for waitForTimeout.
 * @param stepPx     Pixels to advance per scroll step (default 300).
 * @param settleTimeoutMs  Max time to wait for DOM mutations to stop after reaching bottom (default 8000).
 */
export async function scrollElementToBottom(
  container: Locator,
  page: Page,
  stepPx = 300,
  settleTimeoutMs = 8000,
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

  // FIX: replaced fixed 2000ms "wait for the server to finish loading lazy items" sleep with
  // real DOM-mutation-quiet detection — waits exactly as long as new content actually takes
  // to stop arriving, instead of guessing a duration.
  await waitForDomQuiet(container, 400, settleTimeoutMs);
}

