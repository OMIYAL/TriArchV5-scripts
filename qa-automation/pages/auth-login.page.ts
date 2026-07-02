import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { env } from '../utils/env.helper';

export class AuthLoginPage extends BasePage {
  private readonly switchLink: Locator;
  private readonly tenantNameInput: Locator;
  private readonly usernameInput: Locator;
  private readonly passwordInput: Locator;
  private readonly rememberMeText: Locator;
  private readonly loginButton: Locator;

  constructor(page: Page) {
    super(page, env.urls.auth);
    
    this.switchLink = page.getByRole('link', { name: 'switch' });
    this.tenantNameInput = page.getByRole('textbox', { name: 'Name', exact: true });
    this.usernameInput = page.getByRole('textbox', { name: 'Username', exact: true });
    this.passwordInput = page.getByRole('textbox', { name: 'Password', exact: true });
    this.rememberMeText = page.getByText('Remember me');
    this.loginButton = page.getByRole('button', { name: 'Login' });
  }

  async switchTenant(tenantName: string): Promise<void> {
    // 1. Click the switch link
    await this.switchLink.click();
    
    // 2. CRITICAL FIX: Wait for the modal dialog container to appear first
    // This ensures the modal animation/rendering has started
    await this.page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 10000 })
      .catch(() => console.log('Dialog role not found, waiting directly for input...'));
    
    // 3. NOW wait specifically for the Name textbox inside the modal to be visible
    await this.tenantNameInput.waitFor({ state: 'visible', timeout: 15000 });
    
    // 4. Clear and fill (doing it directly here to avoid base class timeout issues)
    await this.tenantNameInput.clear();
    await this.tenantNameInput.fill(tenantName);
    
    // 5. Click Save
    const saveButton = this.page.getByRole('button', { name: 'Save' });
    await saveButton.click();
    
    // 6. Wait for "Saving..." text to disappear from the DOM
    await this.page.waitForFunction(
      () => !document.body.textContent?.includes('Saving...'),
      { timeout: 15000 }
    ).catch(() => {
      console.log('Warning: Saving timeout - continuing anyway');
    });
    
    // 7. Wait for modal to fully close and UI to settle
    await this.page.waitForTimeout(500);
  }

  async login(username: string, password: string): Promise<void> {
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
    
    await this.loginButton.click();
  }

  async completeLoginFlow(
    tenantName: string,
    username: string,
    password: string
  ): Promise<void> {
    // Only switch tenant if the link is actually visible on the page
    if (await this.switchLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.switchTenant(tenantName);
    }
    
    await this.login(username, password);
  }
}