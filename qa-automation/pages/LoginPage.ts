import { Page, Locator } from '@playwright/test';

/**
 * LoginPage — POM for the TriArch portal login flow.
 *
 * Flow:
 *   1. Navigate to portal landing page
 *   2. Click "Access Portal" → redirected to stg-auth.triarch.ai
 *   3. Click SWITCH → enter tenant name → Save
 *   4. Fill username + password → LOGIN
 *   5. Redirected back to the authenticated portal
 */
export class LoginPage {
  readonly page: Page;
  readonly baseUrl: string;

  // --- Landing page locators ---
  readonly accessPortalLink: Locator;

  // --- Auth page: tenant switch ---
  readonly switchBtn: Locator;
  readonly tenantDialog: Locator;
  readonly tenantNameInput: Locator;
  readonly saveTenantBtn: Locator;

  // --- Auth page: login form ---
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginBtn: Locator;

  constructor(page: Page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://stg-portal.triarch.ai/';

    // Landing page
    this.accessPortalLink = page.getByRole('link', { name: 'Access Portal' });

    // SWITCH is a styled anchor on the auth page (not a native <button role="button">)
    this.switchBtn = page.locator('button:has-text("SWITCH"), a:has-text("SWITCH")').first();

    // Switch-tenant modal
    this.tenantDialog    = page.getByRole('dialog');
    this.tenantNameInput = page.getByRole('dialog').getByRole('textbox', { name: /name/i });
    this.saveTenantBtn   = page.getByRole('dialog').getByRole('button', { name: /save/i });

    // Login form
    this.usernameInput = page.getByRole('textbox', { name: /username/i });
    this.passwordInput = page.getByRole('textbox', { name: /password/i });
    this.loginBtn      = page.getByRole('button', { name: /login/i });
  }

  // ─── Individual step methods ──────────────────────────────────────────────

  /** Navigate to the portal landing page. */
  async goto() {
    await this.page.goto(this.baseUrl);
  }

  /** Click the "Access Portal" CTA and wait for redirect — to auth server OR in-app dashboard. */
  async clickAccessPortal() {
    await this.accessPortalLink.waitFor({ state: 'visible', timeout: 15000 });
    await this.accessPortalLink.scrollIntoViewIfNeeded();
    await this.accessPortalLink.click({ force: true });

    // Wait for either the auth server redirect (unauthenticated)
    // OR a URL change within stg-portal.triarch.ai (partially-auth storageState)
    await this.page.waitForURL(
      url => url.hostname.includes('stg-auth.triarch.ai') || url.pathname !== '/',
      { timeout: 20000 }
    );
  }

  /** Open the Switch Tenant modal, set the tenant name, and close the modal. */
  async switchTenant(tenantName: string) {
    await this.page.waitForLoadState('domcontentloaded');
    await this.switchBtn.waitFor({ state: 'visible', timeout: 15000 });
    await this.switchBtn.click();
    await this.tenantDialog.waitFor({ state: 'visible', timeout: 10000 });
    await this.tenantNameInput.clear();
    await this.tenantNameInput.fill(tenantName);
    await this.saveTenantBtn.click();
    await this.tenantDialog.waitFor({ state: 'hidden', timeout: 10000 });
  }

  /** Fill the username and password fields. */
  async fillCredentials(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
  }

  /** Click the LOGIN button and wait for redirect back to the portal. */
  async clickLogin() {
    await this.loginBtn.click();

    // The OAuth redirect back to stg-portal.triarch.ai can be slow (30-60s).
    // Wait up to 60s for the URL to change to the portal domain.
    // If the URL doesn't match but the dashboard is visible, we still consider it success.
    try {
      await this.page.waitForURL(/stg-portal\.triarch\.ai/, { timeout: 60000 });
    } catch {
      // URL check timed out — verify we're actually on the dashboard as fallback
      const isDashboard = await this.page.locator(
        '[class*="lpx-topbar"], .lpx-toolbar, [class*="Control Room"]'
      ).first().isVisible().catch(() => false);

      if (!isDashboard) {
        throw new Error(
          '❌ Login failed: URL did not redirect to stg-portal.triarch.ai and dashboard is not visible.'
        );
      }
      console.log('⚠️  URL redirect was slow — dashboard element confirmed, proceeding.');
    }
  }

  // ─── Composite method ─────────────────────────────────────────────────────

  /**
   * Full login orchestration:
   *   goto → clickAccessPortal → switchTenant → fillCredentials → clickLogin
   */
  async login(tenantName: string, username: string, password: string) {
    await this.goto();
    await this.clickAccessPortal();
    await this.switchTenant(tenantName);
    await this.fillCredentials(username, password);
    await this.clickLogin();
  }
}
