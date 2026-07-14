import { Page, Locator } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { BasePage } from '../base.page';
import { scrollFromTop } from '../../utils/scroll.helper';

export class ServicesListingPage extends BasePage {
  private readonly moreServicesRegion: Locator;

  constructor(page: Page) {
    super(page, (process.env.STOREFRONT_BASE_URL || ''));
    this.moreServicesRegion = page.getByRole('region', { name: 'More services' });
  }

  /** Opens the services listing directly — avoids unnecessary About Us navigation. */
  async openListing(tenantName: string = (process.env.TENANT_NAME || '')): Promise<void> {
    await this.goto('/services', { __tenant: tenantName });
    await this.waitForServicesLoaded();
  }

  private async expandMoreServicesIfNeeded(): Promise<void> {
    if (await this.visibleServiceApplyLinks().count() > 0) return;

    try {
      if (await this.moreServicesRegion.isVisible({ timeout: 2000 })) {
        await this.moreServicesRegion.scrollIntoViewIfNeeded();
        await this.moreServicesRegion.click();
        await this.page.waitForTimeout(500);
      }
    } catch {
      // Region may not exist — proceed
    }
  }

  private serviceApplyLinks(): Locator {
    return this.page.locator('a[href*="serviceDefinitionId"]');
  }

  private visibleServiceApplyLinks(): Locator {
    return this.page.locator('a[href*="serviceDefinitionId"]:visible');
  }

  private async waitForServicesLoaded(): Promise<void> {
    const loading = this.page.getByText('Loading services', { exact: false });
    if (await loading.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loading.waitFor({ state: 'hidden', timeout: 30000 });
    }
    await this.visibleServiceApplyLinks().first().waitFor({ state: 'visible', timeout: 30000 });
  }

  /** Picks a random service link, clicks it, and waits for apply or auth redirect. */
  async clickRandomAvailableService(): Promise<string> {
    await this.expandMoreServicesIfNeeded();
    await this.waitForServicesLoaded();

    const pageButtons = this.page.locator('button:has-text("Page")');
    const totalPages = Math.max(1, await pageButtons.count());
    const randomPageNumber = totalPages === 1 ? 1 : faker.number.int({ min: 1, max: totalPages });

    if (totalPages > 1) {
      console.log(`Found ${totalPages} pages of services. Navigating to Page ${randomPageNumber}...`);
      await this.page.getByRole('button', { name: `Page ${randomPageNumber}` }).click();
      await this.page.waitForLoadState('domcontentloaded');
      await this.waitForServicesLoaded();
    }

    const visibleServiceLinks = this.visibleServiceApplyLinks();
    let totalServicesOnPage = await visibleServiceLinks.count();

    if (totalServicesOnPage === 0 && totalPages > 1) {
      console.log('No visible service links found. Falling back to Page 1...');
      await this.page.getByRole('button', { name: 'Page 1' }).click().catch(() => {});
      await this.waitForServicesLoaded();
      totalServicesOnPage = await visibleServiceLinks.count();
    }

    if (totalServicesOnPage === 0) {
      throw new Error('No visible service application links found on the services listing page.');
    }

    console.log(`Found ${totalServicesOnPage} visible services on Page ${randomPageNumber}.`);

    const randomIndex = faker.number.int({ min: 0, max: totalServicesOnPage - 1 });
    const selectedService = visibleServiceLinks.nth(randomIndex);
    const serviceName = await selectedService.textContent();
    const targetHref = await selectedService.getAttribute('href') || '';

    console.log(`Randomly selected [Page ${randomPageNumber}, Item ${randomIndex + 1}/${totalServicesOnPage}]: ${serviceName?.trim()}`);

    await selectedService.scrollIntoViewIfNeeded();
    await Promise.all([
      this.page.waitForURL(/services\/Apply|Account\/Login|auth.*Login/i, { timeout: 60000 }),
      selectedService.click(),
    ]);

    return targetHref;
  }

  /** Navigates to a service by partial name (case-insensitive). Searches across all pages. */
  async navigateToService(serviceName: string): Promise<string> {
    await this.expandMoreServicesIfNeeded();
    await this.waitForServicesLoaded();

    const namePattern = new RegExp(serviceName, 'i');
    const findLink = () => this.visibleServiceApplyLinks().filter({ hasText: namePattern });

    if (await findLink().first().isVisible({ timeout: 5000 }).catch(() => false)) {
      const link = findLink().first();
      const targetHref = await link.getAttribute('href') || '';
      await Promise.all([
        this.page.waitForURL(/services\/Apply|Account\/Login|auth.*Login/i, { timeout: 60000 }),
        this.click(link),
      ]);
      return targetHref;
    }

    const pageButtons = this.page.locator('button:has-text("Page")');
    const totalPages = await pageButtons.count();

    for (let i = 1; i <= totalPages; i++) {
      await this.page.getByRole('button', { name: `Page ${i}` }).click();
      await this.page.waitForLoadState('domcontentloaded');
      await this.waitForServicesLoaded();

      if (await findLink().first().isVisible({ timeout: 5000 }).catch(() => false)) {
        const link = findLink().first();
        const targetHref = await link.getAttribute('href') || '';
        await Promise.all([
          this.page.waitForURL(/services\/Apply|Account\/Login|auth.*Login/i, { timeout: 60000 }),
          this.click(link),
        ]);
        return targetHref;
      }
    }

    throw new Error(`Service "${serviceName}" not found on any page`);
  }

  async browseAllServices(): Promise<void> {
    await this.page.waitForURL(/\/services/i, { timeout: 15000 });
    await this.page.waitForLoadState('networkidle').catch(() => {});

    const carouselNext = this.page.locator('#fsp-svc-next').first();
    let pageNum = 1;

    while (true) {
      await scrollFromTop(this.page);

      // Advance carousel until Next is disabled (all services on this page seen)
      while (
        await carouselNext.isVisible().catch(() => false) &&
        !await carouselNext.isDisabled().catch(() => true)
      ) {
        await carouselNext.click();
        await this.page.waitForTimeout(700);
        await scrollFromTop(this.page);
      }

      // Move to next pagination page if available
      pageNum++;
      const nextPageBtn = this.page.getByRole('button', { name: `Page ${pageNum}` });
      if (!await nextPageBtn.isVisible({ timeout: 2000 }).catch(() => false)) break;
      await nextPageBtn.click();
      await this.page.waitForLoadState('networkidle').catch(() => {});
    }
  }
}
