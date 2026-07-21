import { Page } from '@playwright/test';
import { AuthLoginPage } from '../pages/auth-login.page';

// Helper to log in, clearing cookies to prevent session bleed between actors
export async function loginToPortal(page: Page, username: string, password: string): Promise<void> {
  const portalUrl = process.env.PORTAL_BASE_URL || '';
  const authUrl = process.env.AUTH_BASE_URL || '';
  const tenant = process.env.TENANT_NAME || 'fps';

  await page.goto(`${authUrl}/connect/endsession`, { waitUntil: 'domcontentloaded' }).catch((e) => { console.log('endsession failed or timeout, continuing', e); });

  await page.context().clearCookies();
  await page.evaluate(() => {
    try { localStorage.clear(); } catch { }
    try { sessionStorage.clear(); } catch { }
  });

  await page.goto(`${portalUrl}?__tenant=${tenant}`);
  const loginLink = page.getByRole('link', { name: /Log in|Sign in/i }).first();
  await loginLink.waitFor({ state: 'visible', timeout: 20000 });
  await loginLink.click();

  await new AuthLoginPage(page).completeLoginFlow(tenant, username, password, /ControlRoom/i);
}
