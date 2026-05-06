import { Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

/**
 * Navigates to the portal and ensures the user is in the authenticated app.
 *
 * The TriArch portal has two states at the same base URL (stg-portal.triarch.ai/):
 *   - PUBLIC:        Shows "Access Portal" CTA button (marketing landing page)
 *   - AUTHENTICATED: Shows the "Control Room" sidebar/dashboard (ABP app)
 *
 * Detection strategy:
 *   1. Go to baseUrl
 *   2. Check for the "Access Portal" link — visible = public page
 *   3. If public: click Access Portal and check where we end up:
 *        → stg-auth.triarch.ai  = session expired → do full login
 *        → stays on stg-portal  = storageState valid → dashboard loaded inline
 *   4. If not public: already authenticated → done
 */
export async function ensureAuthenticated(page: Page): Promise<void> {
  const baseUrl      = process.env.BASE_URL      || 'https://stg-portal.triarch.ai/';
  const tenantName   = process.env.TENANT_NAME   || '';
  const userName     = process.env.USER_NAME      || '';
  const userPassword = process.env.USER_PASSWORD  || '';

  await page.goto(baseUrl);
  await page.waitForLoadState('domcontentloaded');

  // Check if we are on the public landing page
  const accessPortalLink = page.getByRole('link', { name: 'Access Portal' });
  const isPublicPage = await accessPortalLink.isVisible().catch(() => false);

  if (!isPublicPage) {
    // Already on the authenticated dashboard
    console.log('✅  Session is active — already on authenticated portal');
    return;
  }

  console.log('⚠️  On public landing page — clicking Access Portal...');
  await accessPortalLink.scrollIntoViewIfNeeded();
  await accessPortalLink.click({ force: true });

  // Wait up to 20s for either the auth server redirect OR the dashboard to load inline
  // We detect dashboard by waiting for the sidebar nav item OR the auth URL
  const loginPage = new LoginPage(page);

  try {
    // Race: wait for auth server URL (needs full login)
    await page.waitForURL(/stg-auth\.triarch\.ai/, { timeout: 20000 });

    // If we get here: redirected to auth server → do full login
    console.log('🔐  Redirected to auth server — completing login...');
    await loginPage.switchTenant(tenantName);
    await loginPage.fillCredentials(userName, userPassword);
    await loginPage.clickLogin();
    console.log('✅  Logged in successfully');

  } catch {
    // URL didn't change to auth server — check if dashboard loaded inline (storageState worked)
    const isAuthenticated = await page.locator('[class*="lpx-topbar"], .lpx-toolbar, #desktop-sidebar, [class*="Control Room"]')
      .first()
      .isVisible()
      .catch(() => false);

    // Also check the page title
    const title = await page.title();
    const isDashboard = title.includes('Control Room') || title.includes('Dashboard') || isAuthenticated;

    if (isDashboard) {
      console.log(`✅  StorageState session loaded dashboard inline (title: "${title}")`);
    } else {
      // Last resort: navigate directly to the dashboard path
      console.log('🔄  Attempting direct dashboard navigation...');
      await page.goto(baseUrl);
      await page.waitForLoadState('domcontentloaded');
    }
  }
}
