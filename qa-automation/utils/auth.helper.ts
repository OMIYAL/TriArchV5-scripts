import { Page } from '@playwright/test';
import { AuthLoginPage } from '../pages/auth-login.page';

// Helper to log in, clearing cookies to prevent session bleed between actors
export async function loginToPortal(page: Page, username: string, password: string): Promise<void> {
  const portalUrl = process.env.PORTAL_BASE_URL || '';
  const authUrl = process.env.AUTH_BASE_URL || '';

  // Clear storage FIRST, while still on the application's origin. localStorage and
  // sessionStorage are per-origin: doing this after navigating to the auth host clears the
  // AUTH origin's storage and leaves the app's untouched — which is what used to happen here.
  await page.evaluate(() => {
    try { localStorage.clear(); } catch { /* origin may deny access */ }
    try { sessionStorage.clear(); } catch { /* origin may deny access */ }
  }).catch(() => { /* about:blank or cross-origin — nothing to clear */ });

  await page.goto(`${authUrl}/connect/endsession`, { waitUntil: 'domcontentloaded' }).catch((e) => { console.log('endsession failed or timeout, continuing', e); });

  await page.context().clearCookies();

  // Clear again on the auth origin so no IdP-side remnants survive.
  await page.evaluate(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
    try { sessionStorage.clear(); } catch { /* ignore */ }
  }).catch(() => { /* ignore */ });

  await page.goto(portalUrl);
  const loginLink = page.getByRole('link', { name: /Log in|Sign in/i }).first();
  await loginLink.waitFor({ state: 'visible', timeout: 20000 });
  await loginLink.click();

  await new AuthLoginPage(page).completeLoginFlow(username, password, /ControlRoom/i);
}
