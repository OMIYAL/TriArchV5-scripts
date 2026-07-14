import { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { scrollFromTop } from '../../utils/scroll.helper';

export class StorefrontHomePage extends BasePage {
  private readonly aboutUsLink: Locator;
  private readonly servicesLink: Locator;
  private readonly projectNavLink: Locator;

  constructor(page: Page) {
    super(page, process.env.STOREFRONT_BASE_URL ?? '');

    this.servicesLink = page.locator('#MenuItem_Services').first();
    this.aboutUsLink = page.getByRole('link', { name: /About us/i }).first();
    this.projectNavLink = page.getByRole('link', { name: /^Project$/i }).first();
  }

  async navigate(tenantName: string = (process.env.TENANT_NAME || 'fps')): Promise<void> {
    await this.goto('/', { __tenant: tenantName });
    await this.servicesLink.waitFor({ state: 'visible', timeout: 15000 });
  }

  async clickAboutUs(): Promise<void> {
    await this.click(this.aboutUsLink);
  }

  async clickServices(): Promise<void> {
    await this.click(this.servicesLink);
  }

  /** Clicks the "Project" nav link that appears after citizen login. */
  async clickProjectNav(): Promise<void> {
    await this.click(this.projectNavLink);
  }

  /** Navigates to About Us and scrolls through the full page. */
  async browseAboutPage(): Promise<void> {
    await this.clickAboutUs();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await scrollFromTop(this.page);
  }

  /** Navigates to My Projects, reloads the table, and scrolls through the page. */
  async browseMyProjectsPage(): Promise<void> {
    await this.clickProjectNav();
    await this.page.waitForURL(/PermitProjects/i, { timeout: 15000 });
    const reloadBtn = this.page.getByRole('button', { name: 'Reload table' });
    await reloadBtn.waitFor({ state: 'visible', timeout: 10000 });
    await reloadBtn.click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await scrollFromTop(this.page);
  }
}
