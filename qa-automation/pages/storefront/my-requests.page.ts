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
    this.serviceRequestsLink = page.locator('#desktop-sidebar').getByRole('link', { name: 'Service Requests' });
    this.reloadTableButton = page.getByRole('button', { name: 'Reload table' });
    this.statusHistoryLink = page.getByRole('link', { name: 'View status history' });
    this.statusTimelineHeading = page.getByRole('heading', { name: 'Status timeline' });
    this.closeButton = page.getByRole('button', { name: 'Close' });
  }

  async navigateToMyRequests() {
    // Already on the list — avoid re-clicking the sidebar link (SPA remount can drop the table briefly).
    if (/ControlRoom\/ServiceRequests\/?(\?|$)/i.test(this.page.url())) {
      return;
    }
    await expect(this.serviceRequestsLink).toBeVisible({ timeout: 15000 });
    await this.serviceRequestsLink.click();
    await this.page.waitForURL(/ServiceRequests/i, { timeout: 30000, waitUntil: 'domcontentloaded' });
  }

  async waitForListToLoad() {
    await expect(this.reloadTableButton.first()).toBeVisible({ timeout: 30000 });
  }

  /** Waits until DataTables finishes loading (not the transient "Loading..." / Processing row). */
  private async waitForTableData(): Promise<void> {
    await this.page.locator('.dataTables_processing')
      .waitFor({ state: 'hidden', timeout: 60000 })
      .catch(() => { });
    // Prefer a real request link — "Loading..." rows have no tracking-number link.
    await this.page.locator('tbody tr a[href*="ServiceRequests"], .dataTables_empty')
      .first()
      .waitFor({ state: 'visible', timeout: 60000 });
  }

  /** Navigates to My Requests, reloads the table, and scrolls through the page. */
  async navigateReloadAndScroll(): Promise<void> {
    await this.navigateToMyRequests();
    await this.waitForListToLoad();
    await this.reloadTableButton.first().click();
    await this.waitForTableData();
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
    // Try to find the tab by role first, then fallback to text
    let tab = this.page.getByRole('tab', { name: new RegExp(tabName, 'i') });

    if (!await tab.isVisible().catch(() => false)) {
      // Fallback: look for a generic element with the tab name
      tab = this.page.getByText(new RegExp(tabName, 'i')).first();
    }

    if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tab.scrollIntoViewIfNeeded().catch(() => { });
      await tab.click();
      await this.page.waitForTimeout(1000); // Wait for tab transition
    } else {
      console.log(`Warning: Tab '${tabName}' not found or not visible.`);
    }
  }

  async downloadAllDocuments() {
    const downloadButtons = this.page.getByRole('button', { name: 'Download document' });
    const count = await downloadButtons.count();
    const downloads: any[] = [];

    for (let i = 0; i < count; i++) {
      const downloadPromise = this.page.waitForEvent('download', { timeout: 80000 });
      await downloadButtons.nth(i).click({ force: true });
      const download = await downloadPromise;
      downloads.push(download);
    }
    return downloads;
  }

  async selectActiveRequest() {
    await this.navigateReloadAndScroll();

    let targetLink = null;
    let rows = this.page.locator('tbody tr');
    let count = await rows.count();

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const text = await row.textContent();
      // Prefer UNDER REVIEW over PENDING PAYMENT — payment-hold SRs often land on Fee
      // with canSubmit=false until payment/waiver, which is a weaker reviewer path.
      if (text && text.includes('UNDER REVIEW')) {
        targetLink = row.getByRole('link').first();
        break;
      }
    }

    if (!targetLink) {
      console.log('No UNDER REVIEW rows found immediately. Clicking "Under Review" filter...');
      const filterPill = this.page.getByRole('button', { name: 'Under Review', exact: true }).first();

      if (await filterPill.isVisible({ timeout: 5000 }).catch(() => false)) {
        await filterPill.click();
        await this.waitForTableData();

        rows = this.page.locator('tbody tr');
        count = await rows.count();
        for (let i = 0; i < count; i++) {
          const row = rows.nth(i);
          const text = await row.textContent();
          if (text && text.includes('UNDER REVIEW')) {
            targetLink = row.getByRole('link').first();
            break;
          }
        }
      }
    }

    if (targetLink && await targetLink.isVisible().catch(() => false)) {
      await targetLink.click();
      await this.page.waitForURL(/ServiceRequests\/(Detail|Activity)/i, {
        timeout: 30000,
        waitUntil: 'domcontentloaded',
      });
    } else {
      throw new Error('No service requests found with status UNDER REVIEW.');
    }
  }

  async openNextActiveActivity(): Promise<boolean> {
    console.log('Landing on Service Request Details. Waiting for framework to load...');
    await this.page.waitForLoadState('domcontentloaded');
    await this.waitForLoaders();

    // If the service request is now Closed, there are no more activities — stop the loop
    if (await this.page.getByText(/State Machine.*Closed/i).isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Service request is Closed. No more activities to process.');
      return false;
    }

    // Use the specific CSS class for activity Open buttons (a.ta-actrow__open).
    // The broad a:has-text("Open") would also match unrelated links like
    // "Open service request file folder" or sidebar navigation items.
    let openLink = this.page.locator('a.ta-actrow__open').first();
    let isVisible = await openLink.isVisible({ timeout: 10000 }).catch(() => false);

    if (!isVisible) {
      // Check again if the service request is closed before retrying
      if (await this.page.getByText(/State Machine.*Closed/i).isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('Service request is Closed. No more activities to process.');
        return false;
      }

      let retries = 0;
      while (retries < 3 && !isVisible) {
        retries++;
        console.log(`No active activity "Open" link found. Server might be processing workflow in background (Attempt ${retries}/3). Retrying in 10s...`);
        await this.page.waitForTimeout(10000);
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.waitForLoaders();

        if (await this.page.getByText(/State Machine.*Closed/i).isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('Service request is Closed. No more activities to process.');
          return false;
        }

        openLink = this.page.locator('a.ta-actrow__open').first();
        isVisible = await openLink.isVisible({ timeout: 10000 }).catch(() => false);
      }
    }

    if (isVisible) {
      // Extended timeout: staging can take 10-20s to respond to navigation
      await openLink.click({ timeout: 60000 });
      await this.page.waitForURL(/ServiceRequests\/Activity/i, {
        timeout: 60000,
        waitUntil: 'domcontentloaded',
      }).catch(() => { });
      await this.waitForLoaders();
      // Activity pages load their verdict script after navigation — wait for the header button
      // so submitDecision does not race an empty detail shell.
      await this.page.locator('#ActivityVerdictButton')
        .waitFor({ state: 'visible', timeout: 30000 })
        .catch(() => {
          console.log('Warning: #ActivityVerdictButton not visible after opening activity.');
        });
      return true;
    }

    return false;
  }

  /** Reads the SR tracking number (e.g. PCDE002-AL-2026-00011) from the breadcrumb on the SR Detail page. */
  async getTrackingNumber(): Promise<string> {
    // The breadcrumb shows: Home > Service Requests > PCDE002-AL-2026-00011
    // Try the last breadcrumb item first, then the page heading
    const breadcrumbItem = this.page.locator('.breadcrumb-item').last();
    const trackingNumber = await breadcrumbItem.textContent().catch(() => '');
    if (trackingNumber?.trim()) {
      console.log(`Captured tracking number from breadcrumb: ${trackingNumber.trim()}`);
      return trackingNumber.trim();
    }

    // Fallback: read from the <title> tag or h1 heading
    const heading = this.page.locator('h1, .page-title').first();
    const headingText = await heading.textContent().catch(() => '');
    console.log(`Captured tracking number from heading: ${headingText?.trim()}`);
    return headingText?.trim() || '';
  }

  /** Navigates to Service Requests and opens the SR matching the given tracking number. */
  async navigateToRequestByTrackingNumber(trackingNumber: string): Promise<void> {
    await this.navigateToMyRequests();
    if (!/ServiceRequests/i.test(this.page.url())) {
      await this.page.waitForURL(/ServiceRequests/i, { timeout: 30000, waitUntil: 'domcontentloaded' });
    }
    await this.waitForLoaders();

    // Try using a search/filter input if present
    const searchInput = this.page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]').first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill(trackingNumber);
      await this.page.waitForLoadState('networkidle').catch(() => { });
    }

    // Find the row that contains the tracking number and click through to it
    const targetRow = this.page.locator('tbody tr').filter({ hasText: trackingNumber }).first();
    if (await targetRow.isVisible({ timeout: 10000 }).catch(() => false)) {
      await targetRow.getByRole('link').first().click();
      await this.waitForLoaders();
      return;
    }

    // Fallback: scroll through all rows to find a match
    const rows = this.page.locator('tbody tr');
    const count = await rows.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const rowText = await rows.nth(i).textContent().catch(() => '');
      if (rowText?.includes(trackingNumber)) {
        await rows.nth(i).getByRole('link').first().click();
        await this.waitForLoaders();
        return;
      }
    }

    throw new Error(`Service Request with tracking number "${trackingNumber}" not found in the list.`);
  }
}
