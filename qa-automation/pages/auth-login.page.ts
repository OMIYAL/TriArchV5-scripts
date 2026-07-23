import { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { guideClick, guideType } from '../utils/mimik-action.helper';
import { isMimikGuideMode } from '../utils/mimik.helper';

export class AuthLoginPage extends BasePage {
  private readonly switchLink: Locator;
  private readonly tenantNameInput: Locator;
  private readonly usernameInput: Locator;
  private readonly passwordInput: Locator;
  private readonly rememberMeText: Locator;
  private readonly loginButton: Locator;

  constructor(page: Page) {
    super(page, process.env.AUTH_BASE_URL || '');
    this.switchLink = page.getByRole('link', { name: /switch/i }).or(page.getByRole('button', { name: /switch/i }));
    this.tenantNameInput = page.getByRole('textbox', { name: /^Name$/i });
    this.usernameInput = page.getByRole('textbox', { name: /Username/i });
    this.passwordInput = page.getByRole('textbox', { name: /Password/i });
    this.rememberMeText = page.getByText(/Remember me/i);
    this.loginButton = page.getByRole('button', { name: /Login/i });
  }

  async switchTenant(tenantName: string): Promise<void> {
    await guideClick(this.page, this.switchLink);
    await this.page.waitForSelector('[role="dialog"]', { state: 'visible' }).catch(() => {});
    await this.tenantNameInput.waitFor({ state: 'visible' });

    if (isMimikGuideMode()) {
      await guideType(this.page, this.tenantNameInput, tenantName);
    } else {
      await this.tenantNameInput.clear();
      await this.tenantNameInput.fill(tenantName);
    }

    await guideClick(this.page, this.page.getByRole('button', { name: /Save/i }));
    await this.page
      .waitForFunction(() => !document.body.textContent?.includes('Saving...'))
      .catch(() => {});
  }

  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.waitFor({ state: 'visible' });
    await this.passwordInput.waitFor({ state: 'visible' });

    if (isMimikGuideMode()) {
      await guideType(this.page, this.usernameInput, username);
      await guideType(this.page, this.passwordInput, password);
    } else {
      await this.usernameInput.clear();
      await this.usernameInput.fill(username);
      await this.passwordInput.clear();
      await this.passwordInput.fill(password);
    }

    // Skip Remember me in guide mode — label click + checkbox toggle become two Mimik steps.
    if (!isMimikGuideMode() && (await this.rememberMeText.isVisible().catch(() => false))) {
      await guideClick(this.page, this.rememberMeText);
    }

    // Click first, then wait until we leave auth — do not match "storefront" inside ReturnUrl.
    await guideClick(this.page, this.loginButton);
    await this.page.waitForURL(
      (url) => /storefront/i.test(url.hostname),
      { waitUntil: 'domcontentloaded' },
    );
  }

  async completeLoginFlow(tenantName: string, username: string, password: string): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.usernameInput.waitFor({ state: 'visible' });

    const currentTenant = await this.page.locator('strong').first().textContent().catch(() => '');
    if (currentTenant?.trim().toLowerCase() !== tenantName.toLowerCase()) {
      if (await this.switchLink.isVisible().catch(() => false)) {
        await this.switchTenant(tenantName);
      }
    } else {
      console.log(`Tenant already set to "${tenantName}".`);
    }

    await this.login(username, password);
  }
}