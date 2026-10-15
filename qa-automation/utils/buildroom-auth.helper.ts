import { Page } from '@playwright/test';
import { AuthLoginPage } from '../pages/auth-login.page';

/**
 * Logs in to BuildRoom. Playwright starts each test in a fresh browser context, so there is no
 * leftover session to clear. Uses BUILDROOM_USERNAME / BUILDROOM_PASSWORD unless others are given.
 */
export async function loginToBuildRoom(
  page: Page,
  username: string = process.env.BUILDROOM_USERNAME || '',
  password: string = process.env.BUILDROOM_PASSWORD || ''
): Promise<void> {
  const buildRoomUrl = process.env.BUILDROOM_BASE_URL || '';
  await page.goto(buildRoomUrl, { waitUntil: 'domcontentloaded' });

  const loginLink = page.getByRole('link', { name: /Log in|Sign in/i }).first();
  const loginButton = page.getByRole('button', { name: /Log in|Sign in/i }).first();
  if (await loginLink.isVisible({ timeout: 20000 }).catch(() => false)) {
    await loginLink.click();
  } else if (await loginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loginButton.click();
  } else {
    throw new Error(`BuildRoom login control was not shown at ${page.url()}.`);
  }

  await new AuthLoginPage(page).completeLoginFlow(username, password, /BuildRoom/i);
  await dismissActiveTour(page);
}

/** Closes the "Guided product tours" popover if one shows after login — its backdrop blocks every click behind it. */
export async function dismissActiveTour(page: Page): Promise<void> {
  const popover = page.locator('.driver-popover');
  if (await popover.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.locator('.driver-popover-close-btn').click();
    await popover.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
}
