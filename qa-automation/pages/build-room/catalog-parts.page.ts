import { Page, Locator } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';

/** The price-source tag under a row's material cost (the brand tag sits in the part column). */
const PRICE_SOURCE_TAG = 'td.ta-col-matcost .ta-tag--data';

/**
 * Catalog → Parts & Assemblies (/Catalog/CatalogParts) — the grid of catalog parts/assemblies,
 * plus entry points for Bulk Reprice, Price Import, New Part, New Assembly.
 */
export class CatalogPartsPage extends BuildRoomBasePage {
  readonly heading: Locator;
  readonly searchBox: Locator;
  readonly bulkRepriceButton: Locator;
  readonly newPartButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Parts & Assemblies' });
    this.searchBox = page.getByRole('textbox', { name: /Search name, catalog number, brand/i });
    this.bulkRepriceButton = page.getByRole('button', { name: 'Bulk reprice' });
    this.newPartButton = page.getByRole('button', { name: 'New part' });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${this.baseUrl}/Catalog/CatalogParts`, { waitUntil: 'domcontentloaded' });
    await this.heading.waitFor({ state: 'visible', timeout: 30000 });
    await this.waitForBuildRoomLoaders();
  }

  async openBulkReprice(): Promise<void> {
    await this.bulkRepriceButton.click();
  }

  async openNewPart(): Promise<void> {
    await this.newPartButton.click();
  }

  /** The grid re-fetches server-side on filter — wait for that response rather than a fixed sleep. */
  async search(query: string): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/catalog/catalog-parts') &&
        resp.url().includes(`filterText=${encodeURIComponent(query)}`) &&
        resp.status() === 200
    );
    await this.searchBox.fill(query);
    await responsePromise;
  }

  /** The part's name cell; clicking it opens the edit panel. (A role locator would also match a hidden duplicate.) */
  partRowLink(name: string): Locator {
    return this.page.locator('.ta-pricebook-part-name').filter({ hasText: this.exactText(name) });
  }

  async hasPartRow(name: string): Promise<boolean> {
    return this.partRowLink(name).isVisible({ timeout: 5000 }).catch(() => false);
  }

  async openPartByName(name: string): Promise<void> {
    await this.partRowLink(name).click();
  }

  async searchAndOpenPart(name: string): Promise<void> {
    await this.search(name);
    await this.openPartByName(name);
  }

  private gridRow(name: string): Locator {
    return this.page.locator('tr', { has: this.partRowLink(name) });
  }

  /** A Locator, so assertions retry while the grid reloads after a save. */
  gridRowPriceLocator(name: string): Locator {
    return this.gridRow(name).locator('.ta-pricebook-matcost-value');
  }

  gridRowPriceSourceLocator(name: string): Locator {
    return this.gridRow(name).locator(PRICE_SOURCE_TAG);
  }

  /** The price-source tag of every visible row. */
  allGridRowPriceSourceLocators(): Locator {
    return this.page.locator(PRICE_SOURCE_TAG);
  }
}
