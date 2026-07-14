import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../base.page';
import { scrollFromTop } from '../../utils/scroll.helper';

export class MyRequestsPage extends BasePage {
  readonly serviceRequestsLink: Locator;
  readonly reloadTableButton: Locator;
  readonly statusHistoryLink: Locator;
  readonly statusTimelineHeading: Locator;
  readonly closeButton: Locator;

  constructor(page: Page) {
    super(page);
    this.serviceRequestsLink = page.getByRole('link', { name: 'Service Requests' });
    this.reloadTableButton = page.getByRole('button', { name: 'Reload table' });
    this.statusHistoryLink = page.getByRole('link', { name: 'View status history' });
    this.statusTimelineHeading = page.getByRole('heading', { name: 'Status timeline' });
    this.closeButton = page.getByRole('button', { name: 'Close' });
  }

  async navigateToMyRequests() {
    await expect(this.serviceRequestsLink).toBeVisible();
    await this.serviceRequestsLink.click();
  }

  async waitForListToLoad() {
    await expect(this.reloadTableButton.first()).toBeVisible();
  }

  /** Navigates to My Requests, reloads the table, and scrolls through the page. */
  async navigateReloadAndScroll(): Promise<void> {
    await this.navigateToMyRequests();
    await this.page.waitForURL(/ServiceRequests/i, { timeout: 15000 });
    await this.waitForListToLoad();
    await this.reloadTableButton.click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await scrollFromTop(this.page);
  }

  async selectClosedRequest() {
    await expect(this.page.getByRole('cell', { name: 'Closed' }).first()).toBeVisible();
    const closedRows = this.page.getByRole('row').filter({ hasText: 'Closed' });
    const count = await closedRows.count();

    const randomIndex = Math.floor(Math.random() * count);
    const randomRow = closedRows.nth(randomIndex);

    await randomRow.getByRole('link').first().click();
  }

  async verifyRedirectedToClosedRequest() {
    await expect(this.page.getByText('Request Status Closed')).toBeVisible();
  }

  async viewStatusHistory() {
    await expect(this.statusHistoryLink).toBeVisible();
    await this.statusHistoryLink.click();
    await expect(this.statusTimelineHeading).toBeVisible();
    await this.closeButton.click();
  }

  async selectTab(tabName: string) {
    const tabList = this.page.getByRole('tablist');
    await tabList.scrollIntoViewIfNeeded(); // Scroll the whole tab area into view once

    const tab = this.page.getByRole('tab', { name: new RegExp(tabName, 'i') });
    if (await tab.isVisible().catch(() => false)) {
      await tab.click();
      await this.page.waitForTimeout(1000); // Wait for tab transition
    }
  }

  async downloadAllDocuments() {
    const downloadButtons = this.page.getByRole('button', { name: 'Download document' });
    const count = await downloadButtons.count();
    const downloads: any[] = [];

    for (let i = 0; i < count; i++) {
      const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });
      await downloadButtons.nth(i).click({ force: true });
      const download = await downloadPromise;
      downloads.push(download);
    }
    return downloads;
  }
}
