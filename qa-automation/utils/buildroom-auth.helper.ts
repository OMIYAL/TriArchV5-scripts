import { Page } from '@playwright/test';
import { AuthLoginPage } from '../pages/auth-login.page';

/** True when the page is showing an anonymous view, i.e. a "Log in" button or link is present. */
async function hasLoginAffordance(page: Page, timeout = 8000): Promise<boolean> {
  const loginButton = page.getByRole('button', { name: /Log in|Sign in/i }).first();
  if (await loginButton.isVisible({ timeout }).catch(() => false)) return true;

  const loginLink = page.getByRole('link', { name: /Log in|Sign in/i }).first();
  return loginLink.isVisible({ timeout: 3000 }).catch(() => false);
}

/**
 * Tears down the current session completely and checks it worked, so a scenario never starts on a
 * leftover login. Clearing cookies alone isn't enough: the identity provider keeps its own session.
 * The order matters:
 *  1. Clear storage while still on the app's origin (it is per-origin).
 *  2. End the session at the identity provider.
 *  3. Drop all cookies.
 *  4. Clear storage again on the auth origin.
 * Ends on `appUrl`, logged out.
 */
async function clearBuildRoomSession(page: Page, appUrl: string): Promise<void> {
  const authUrl = process.env.AUTH_BASE_URL || '';

  const clearStorage = () =>
    page
      .evaluate(() => {
        try { localStorage.clear(); } catch { /* origin may deny access */ }
        try { sessionStorage.clear(); } catch { /* origin may deny access */ }
      })
      .catch(() => { /* about:blank or cross-origin — nothing to clear */ });

  await clearStorage();
  await page
    .goto(`${authUrl}/connect/endsession`, { waitUntil: 'domcontentloaded' })
    .catch((e) => console.log(`[session] endsession failed or timed out — continuing: ${e.message}`));
  await page.context().clearCookies();
  await clearStorage();

  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  if (await hasLoginAffordance(page)) {
    console.log('[session] Session fully cleared and verified logged out.');
    return;
  }

  // Still signed in: clear once more, and say so if it still didn't work.
  console.log(`[session] WARNING: still appears logged in at ${page.url()} after clearing. Clearing again...`);
  await page.context().clearCookies();
  await clearStorage();
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  if (!(await hasLoginAffordance(page))) {
    console.log(`[session] WARNING: STILL appears logged in at ${page.url()} after a second clear. Continuing anyway.`);
  }
}

/**
 * Logs in to BuildRoom, clearing any leftover session first so scenarios never bleed into a stale
 * login. Uses the BUILDROOM_USERNAME / BUILDROOM_PASSWORD account unless others are given.
 */
export async function loginToBuildRoom(
  page: Page,
  username: string = process.env.BUILDROOM_USERNAME || '',
  password: string = process.env.BUILDROOM_PASSWORD || ''
): Promise<void> {
  const buildRoomUrl = process.env.BUILDROOM_BASE_URL || '';
  await clearBuildRoomSession(page, buildRoomUrl);

  const loginLink = page.getByRole('link', { name: /Log in|Sign in/i }).first();
  await loginLink.waitFor({ state: 'visible', timeout: 20000 });
  await loginLink.click();

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
