import { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';

export class StorefrontHomePage extends BasePage {
  private readonly aboutUsLink: Locator;
  private readonly servicesLink: Locator;

  constructor(page: Page) {
    super(page, (process.env.STOREFRONT_BASE_URL || ''));
    
    this.aboutUsLink = page.getByRole('link', { name: 'About us' });
    this.servicesLink = page.locator('#MenuItem_Services').first();
  }

  async navigate(tenantName: string = (process.env.TENANT_NAME || '')): Promise<void> {
    await this.goto('/', { __tenant: tenantName });
    await this.servicesLink.waitFor({ state: 'visible', timeout: 15000 });
  }

  async navigateToServices(tenantName: string = (process.env.TENANT_NAME || '')): Promise<void> {
    await this.goto('/services', { __tenant: tenantName });
    await this.page.getByRole('heading', { name: /Services built on|Services/i }).first()
      .waitFor({ state: 'visible', timeout: 15000 });
  }

  async clickAboutUs(): Promise<void> {
    await this.click(this.aboutUsLink);
  }

  async clickServices(): Promise<void> {
    await this.click(this.servicesLink);
  }
}
