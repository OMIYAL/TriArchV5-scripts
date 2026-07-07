import { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';

export class ServicesListingPage extends BasePage {
  private readonly moreServicesRegion: Locator;

  constructor(page: Page) {
    super(page, (process.env.STOREFRONT_BASE_URL || ''));
    this.moreServicesRegion = page.getByRole('region', { name: 'More services' });
  }

  async expandMoreServicesIfNeeded(): Promise<void> {
    try {
      if (await this.moreServicesRegion.isVisible({ timeout: 3000 })) {
        await this.click(this.moreServicesRegion);
      }
    } catch {
      // Region might not exist or be visible
    }
  }

  /**
   * DYNAMIC: Finds all available service request links, 
   * picks one RANDOMLY, captures its URL, and clicks it.
   * @returns The href (URL) of the service that was clicked
   */
  /**
   * DYNAMIC: Navigates to a RANDOM page, then picks a RANDOM service from that page.
   * @returns The href (URL) of the service that was clicked
   */
  async clickRandomAvailableService(): Promise<string> {
    // 1. Expand the "More services" section so pagination buttons appear
    await this.expandMoreServicesIfNeeded();
    await this.page.waitForTimeout(1000);

    // 2. Find all pagination buttons (e.g., "Page 1", "Page 2", etc.)
    const pageButtons = this.page.locator('button:has-text("Page")');
    let totalPages = 1;
    
    if (await pageButtons.count() > 0) {
      totalPages = await pageButtons.count();
    }
    
    console.log(`📚 Found ${totalPages} pages of services.`);

    // 3. Pick a random page number
    const randomPageNumber = Math.floor(Math.random() * totalPages) + 1; 
    console.log(`🎲 Navigating to Page ${randomPageNumber}...`);
    
    // 4. Click the random page button (unless it's page 1, which we are already on)
    if (randomPageNumber > 1) {
      await this.page.getByRole('button', { name: `Page ${randomPageNumber}` }).click();
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(1500); // Wait for the new page of services to render
    }

    // 5. Find all services on this newly loaded random page
    const allServiceLinks = this.page.getByRole('link', { name: /^Request .+ Review$/ });
    await allServiceLinks.first().waitFor({ state: 'visible', timeout: 10000 });
    
    let totalServicesOnPage = await allServiceLinks.count();
    
    // Safety Check: If the random page was mysteriously empty, fallback to Page 1
    if (totalServicesOnPage === 0) {
      console.log('⚠️ Random page was empty. Falling back to Page 1...');
      await this.page.getByRole('button', { name: 'Page 1' }).click();
      await this.page.waitForTimeout(1500);
      totalServicesOnPage = await allServiceLinks.count();
    }

    console.log(`🔍 Found ${totalServicesOnPage} services on Page ${randomPageNumber}.`);
    
    // 6. Pick a random service from this page
    const randomIndex = Math.floor(Math.random() * totalServicesOnPage);
    const selectedService = allServiceLinks.nth(randomIndex);
    
    // Get the text for logging
    const serviceName = await selectedService.textContent();
    console.log(`🎯 Randomly selected [Page ${randomPageNumber}, Item ${randomIndex + 1}/${totalServicesOnPage}]: ${serviceName?.trim()}`);
    
    // 7. Capture URL and click
    const targetHref = await selectedService.getAttribute('href') || '';
    await this.click(selectedService);
    
    return targetHref;
  }

  /**
   * Navigates to a specific service by name.
   */
  async navigateToService(serviceName: string): Promise<string> {
    await this.expandMoreServicesIfNeeded();
    await this.page.waitForTimeout(1000);

    const serviceLink = this.page.getByRole('link', { name: serviceName, exact: false });
    if (await serviceLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const targetHref = await serviceLink.getAttribute('href') || '';
      await this.click(serviceLink);
      return targetHref;
    }

    // Search pagination if not found on the first page
    const pageButtons = this.page.locator('button:has-text("Page")');
    const totalPages = await pageButtons.count();
    
    for (let i = 1; i <= totalPages; i++) {
      await this.page.getByRole('button', { name: `Page ${i}` }).click();
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(1000);

      const link = this.page.getByRole('link', { name: serviceName, exact: false });
      if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
        const targetHref = await link.getAttribute('href') || '';
        await this.click(link);
        return targetHref;
      }
    }

    throw new Error(`❌ Service "${serviceName}" not found on any page`);
  }
}
