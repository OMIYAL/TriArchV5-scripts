import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class AuthLoginPage extends BasePage {
  private readonly usernameInput: Locator;
  private readonly passwordInput: Locator;
  private readonly rememberMeText: Locator;
  private readonly loginButton: Locator;

  constructor(page: Page) {
    super(page, (process.env.AUTH_BASE_URL || ''));

    // NOTE: switchLink / tenantNameInput removed — the switch-tenant modal no longer exists.
    // Tenant identity is now determined by the subdomain URL that triggered the OIDC redirect.
    this.usernameInput = page.getByRole('textbox', { name: 'Username', exact: true });
    this.passwordInput = page.getByRole('textbox', { name: 'Password', exact: true });
    this.rememberMeText = page.getByText('Remember me');
    this.loginButton = page.getByRole('button', { name: 'Login' });
  }


  async login(username: string, password: string, redirectUrlRegex: RegExp = /storefront|ControlRoom/i): Promise<void> {
    // Wait for login form to be ready
    await this.usernameInput.waitFor({ state: 'visible', timeout: 10000 });
    await this.passwordInput.waitFor({ state: 'visible', timeout: 5000 });

    // Clear and fill directly to control timeouts
    await this.usernameInput.clear();
    await this.usernameInput.fill(username);

    await this.passwordInput.clear();
    await this.passwordInput.fill(password);

    // Handle Remember Me if visible
    if (await this.rememberMeText.isVisible().catch(() => false)) {
      await this.rememberMeText.click();
    }

    // MyDay / storefront keep streaming widgets, so waitUntil:'load' never settles after OIDC.
    // Wait for URL match on domcontentloaded so login does not hang on an already-landed portal.
    await this.loginButton.click();
    await this.page.waitForURL(redirectUrlRegex, { timeout: 90000, waitUntil: 'domcontentloaded' });
  }

  async completeLoginFlow(
    username: string,
    password: string,
    redirectUrlRegex: RegExp = /storefront|ControlRoom/i
  ): Promise<void> {
    // Tenant is resolved server-side from the subdomain URL that triggered the OIDC redirect.
    // No tenant switching is needed here — the auth page already shows the correct tenant.
    await this.page.waitForLoadState('domcontentloaded');
    await this.usernameInput.waitFor({ state: 'visible', timeout: 30000 });

    await this.login(username, password, redirectUrlRegex);

    // Dismiss cookie banner if it appears after login
    const cookieBtn = this.page.locator('button:has-text("Accept"), button:has-text("I Agree")').first();
    if (await cookieBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cookieBtn.click();
      console.log(' Global cookie banner accepted.');
    }
  }
}