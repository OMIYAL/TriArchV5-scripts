import { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { env } from '../../utils/env.helper';

export class StorefrontHomePage extends BasePage {
  private readonly aboutUsLink: Locator;
  private readonly servicesLink: Locator;

  constructor(page: Page) {
    super(page, env.urls.storefront);
    
    this.aboutUsLink = page.getByRole('link', { name: 'About us' });
    this.servicesLink = page.getByRole('link', { name: 'Services' });
  }

  async navigate(tenantName: string = env.tenant.name): Promise<void> {
    await this.goto('/', { __tenant: tenantName });
    await this.waitForNetworkIdle();
  }

  async clickAboutUs(): Promise<void> {
    await this.click(this.aboutUsLink);
  }

  async clickServices(): Promise<void> {
    await this.click(this.servicesLink);
  }
}