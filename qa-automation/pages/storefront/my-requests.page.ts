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

  /**
   * After a filter-pill click the DataTable fires a new XHR render cycle.
   * The old rows are still in the DOM when waitForTableData() is called, so it
   * resolves immediately against stale data.  This helper waits for the
   * processing spinner to appear (giving it up to 3 s) and then waits for it
   * to fully disappear before confirming fresh rows are present.
   */
  private async waitForFilteredTableData(): Promise<void> {
    const processing = this.page.locator('.dataTables_processing');
    // Give the filter XHR a short window to kick off the spinner.
    await processing
      .waitFor({ state: 'visible', timeout: 3000 })
      .catch(() => { /* spinner may appear and vanish faster than 3 s — that's fine */ });
    // Now wait for the spinner to fully hide (fresh rows will be rendered after).
    await processing
      .waitFor({ state: 'hidden', timeout: 60000 })
      .catch(() => { });
    // Confirm at least one real row (or an empty-table notice) is present.
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

  /**
   * Returns the number of `.ta-reviewer-chip` elements on the current SR detail page.
   * Waits briefly for the card to render before counting.
   */
  private async getReviewerCount(): Promise<number> {
    const chips = this.page.locator('.ta-reviewer-chip');
    await chips.first().waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
    const count = await chips.count().catch(() => 0);
    console.log(`  Reviewer chip count: ${count}`);
    return count;
  }

  /**
   * Navigates to Service Requests, finds an UNDER REVIEW SR, and opens it.
   *
   * @param requireSingleReviewer - When true, skips SRs with more than one reviewer chip
   *   (used by reviewer-workflow.feature).
   * @param requireMultiReviewer  - When true, skips SRs with only one reviewer chip
   *   (used by different-reviewer.feature).
   * Both default to false, preserving existing behaviour for all other callers.
   */
  async selectActiveRequest(requireSingleReviewer = false, requireMultiReviewer = false): Promise<void> {
    await this.navigateReloadAndScroll();

    // Tracks hrefs already visited so we never re-click the same SR after going back.
    const visited = new Set<string>();

    /**
     * Scans current table rows row-by-row, clicks the first unvisited UNDER REVIEW row,
     * and validates the reviewer chip count when a filter is requested.
     * Returns true when a suitable SR is open; false when the page is exhausted.
     */
    const scanAndSelect = async (): Promise<boolean> => {
      const rows = this.page.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const text = await row.textContent().catch(() => '');

        // Prefer UNDER REVIEW over PENDING PAYMENT — payment-hold SRs often land
        // on Fee with canSubmit=false until payment/waiver, which is a weaker path.
        if (!text?.includes('UNDER REVIEW')) continue;

        const link = row.getByRole('link').first();
        const href = await link.getAttribute('href').catch(() => null);

        // Skip rows with no link, invisible links, or already-tried rows
        if (!href || visited.has(href)) continue;
        if (!await link.isVisible().catch(() => false)) continue;

        visited.add(href);
        await link.click();
        await this.page.waitForURL(/ServiceRequests\/(Detail|Activity)/i, {
          timeout: 30000,
          waitUntil: 'domcontentloaded',
        });

        // No reviewer-count filter required — accept any UNDER REVIEW SR
        if (!requireSingleReviewer && !requireMultiReviewer) return true;

        // Count chips once and apply whichever filter is active
        const chipCount = await this.getReviewerCount();

        if (requireSingleReviewer && chipCount === 1) {
          console.log(`  ✅ Single-reviewer SR selected: ${href}`);
          return true;
        }
        if (requireMultiReviewer && chipCount >= 2) {
          console.log(`  ✅ Multi-reviewer SR (${chipCount} reviewers) selected: ${href}`);
          return true;
        }

        // SR doesn't meet the reviewer-count requirement — skip it
        const reason = requireSingleReviewer ? 'Multi-reviewer' : 'Single-reviewer';
        console.log(`  ⏭ ${reason} SR skipped (${href}). Going back...`);
        await this.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.waitForTableData();

        // Recurse: DOM is fresh after navigation; visited Set prevents re-clicking
        return scanAndSelect();
      }

      return false; // All UNDER REVIEW rows on this page exhausted
    };

    // First pass: scan the default page view
    if (await scanAndSelect()) return;

    // Second pass: apply the "Under Review" filter pill and scan row by row
    console.log('No suitable UNDER REVIEW SR found in default view. Applying "Under Review" filter...');
    const filterPill = this.page.getByRole('button', { name: 'Under Review', exact: true }).first();

    if (await filterPill.isVisible({ timeout: 5000 }).catch(() => false)) {
      await filterPill.click();
      await this.waitForFilteredTableData();

      if (await scanAndSelect()) return;
    }

    throw new Error(
      requireSingleReviewer
        ? 'No single-reviewer UNDER REVIEW service request found. All visible SRs are assigned to multiple reviewers.'
        : requireMultiReviewer
        ? 'No multi-reviewer UNDER REVIEW service request found. All visible SRs are assigned to a single reviewer.'
        : 'No service requests found with status UNDER REVIEW.'
    );
  }

  /**
   * On the SR detail page, finds the first ACTIVE activity step that the currently
   * logged-in reviewer CANNOT open (no `a.ta-actrow__open` link) and returns the
   * username of the reviewer it is assigned to.
   *
   * Title attribute format: "SandeepP (Active)" — the username is the portion before " (".
   *
   * Returns null when every active step can be opened by the current reviewer,
   * or when no blocking step is found.
   *
   * Used by the dual-reviewer flow to detect when account-switching is needed.
   */
  async getActiveStepAssignedReviewer(): Promise<string | null> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.waitForLoaders();

    // Active lanes that the current reviewer CANNOT open (no Open link rendered)
    const blockedActiveLanes = this.page.locator(
      '.ta-activity-lane--st-active:not(:has(a.ta-actrow__open))'
    );

    const laneCount = await blockedActiveLanes.count().catch(() => 0);
    if (laneCount === 0) return null;

    // Read the reviewer avatar title from the first blocked active step
    const avatar = blockedActiveLanes.first().locator('span.ta-actrow__avatar[title]');
    const title = await avatar.getAttribute('title').catch(() => null);
    if (!title) return null;

    // Extract username: "SandeepP (Active)" → "SandeepP"
    const username = title.split(' (')[0].trim();
    console.log(`  Blocked active step assigned to: "${username}" (full title: "${title}")`);
    return username || null;
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
        await this.page.waitForTimeout(1000);
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

    const tryFindTrackingNumberInRows = async (): Promise<boolean> => {
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
        return true;
      }

      // Fallback: scroll through all rows to find a match
      const rows = this.page.locator('tbody tr');
      const count = await rows.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const rowText = await rows.nth(i).textContent().catch(() => '');
        if (rowText?.includes(trackingNumber)) {
          await rows.nth(i).getByRole('link').first().click();
          await this.waitForLoaders();
          return true;
        }
      }

      return false;
    };

    if (await tryFindTrackingNumberInRows()) {
      return;
    }

    console.log(`Tracking number "${trackingNumber}" not found in the first-page rows. Attempting Under Review filter fallback.`);
    const filterPill = this.page.getByRole('button', { name: 'Under Review', exact: true }).first();
    if (await filterPill.isVisible({ timeout: 5000 }).catch(() => false)) {
      await filterPill.click();
      // Use the filter-aware wait so stale rows (e.g. CLOSED) are flushed
      // before we read the table content.
      await this.waitForFilteredTableData();

      console.log('Under Review filter applied. Re-filling search input and traversing all rows...');

      // Re-fill the search input (same as first-page approach)
      const searchInput = this.page
        .locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]')
        .first();
      if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await searchInput.fill(trackingNumber);
        await this.page.waitForLoadState('networkidle').catch(() => { });
      }

      // Fast path: filter already narrowed the table — check the highlighted row first
      const targetRow = this.page.locator('tbody tr').filter({ hasText: trackingNumber }).first();
      if (await targetRow.isVisible({ timeout: 10000 }).catch(() => false)) {
        console.log(`Found tracking number "${trackingNumber}" via filtered row (Under Review). Clicking link...`);
        await targetRow.getByRole('link').first().click();
        await this.waitForLoaders();
        return;
      }

      // Exhaustive row-by-row traversal (same as first page) — log every row checked
      const rows = this.page.locator('tbody tr');
      const count = await rows.count().catch(() => 0);
      console.log(`Traversing all ${count} row(s) in Under Review filtered table...`);
      for (let i = 0; i < count; i++) {
        const rowText = await rows.nth(i).textContent().catch(() => '');
        console.log(`  Row ${i + 1}/${count}: ${rowText?.trim().substring(0, 80)}`);
        if (rowText?.includes(trackingNumber)) {
          console.log(`  ✓ Match found at row ${i + 1}. Clicking link...`);
          await rows.nth(i).getByRole('link').first().click();
          await this.waitForLoaders();
          return;
        }
      }

      console.log(`Tracking number "${trackingNumber}" not found after traversing all ${count} Under Review row(s).`);
    }

    throw new Error(`Service Request with tracking number "${trackingNumber}" not found in the list.`);
  }
}
