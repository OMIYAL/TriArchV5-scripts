import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../base.page';
import { scrollFromTop } from '../../utils/scroll.helper';
import { waitForTableData, waitForFilteredTableData } from '../../utils/table.helper';

/**
 * Page object for the SR list view (My Requests / Control Room Service Requests).
 * Responsibility: list-level navigation and actor-specific table scanning.
 *
 * Detail-page interactions (tabs, documents, tracking number, reviewer inspection)
 * live in pages/sr-detail.page.ts (shared) or pages/control-room/portal-sr-detail.page.ts.
 */
export class MyRequestsPage extends BasePage {
  readonly serviceRequestsLink: Locator;
  readonly reloadTableButton: Locator;

  constructor(page: Page) {
    super(page);
    // Use .first() to avoid strict-mode violation: the Control Room pages render
    // a sidebar nav link AND a breadcrumb link both matching this text.
    this.serviceRequestsLink = page.getByRole('link', { name: /Service Requests|My Requests/ }).first();
    this.reloadTableButton = page.getByRole('button', { name: 'Reload table' });
  }

  async navigateToMyRequests(): Promise<void> {
    if (/ControlRoom\/ServiceRequests\/?(\?|$)/i.test(this.page.url())) return;
    // Navigate directly rather than relying on a link click — avoids strict-mode
    // violations when both a sidebar link and a breadcrumb link are present.
    const linkVisible = await this.serviceRequestsLink.isVisible({ timeout: 15000 }).catch(() => false);
    if (linkVisible) {
      await this.serviceRequestsLink.click();
    } else {
      // Absolute URL — this method is called from both portal-auth-setup (baseURL=PORTAL)
      // and e2e-full-flow (baseURL=STOREFRONT) projects. A relative URL would resolve
      // against the wrong host in the e2e case.
      const portalUrl = process.env.PORTAL_BASE_URL || '';
      await this.page.goto(`${portalUrl}/ControlRoom/ServiceRequests`, { waitUntil: 'domcontentloaded' });
    }
    await this.page.waitForURL(/ServiceRequests/i, { timeout: 30000, waitUntil: 'domcontentloaded' });
  }

  async waitForListToLoad(): Promise<void> {
    await expect(this.reloadTableButton.first()).toBeVisible({ timeout: 30000 });
  }

  /** Delegates to table.helper — waits for DataTable to finish any load cycle. */
  private async waitForTableData(): Promise<void> {
    return waitForTableData(this.page);
  }

  /** Delegates to table.helper — filter-pill-aware DataTable wait. */
  private async waitForFilteredTableData(): Promise<void> {
    return waitForFilteredTableData(this.page);
  }

  /**
   * Expands the DataTable page size to `size` entries (default 50) using the
   * custom `.ta-length-menu` component visible in the table footer.
   *
   * Flow (confirmed from DevTools):
   *  1. Scroll the footer into view so the control is reachable.
   *  2. Read the button text — skip if the desired size is already active.
   *  3. Click `.ta-length-menu__btn` to open the dropdown.
   *  4. Wait for the menu container to receive the `.is-open` class.
   *  5. Click the matching `.ta-length-menu__option` (exact text match).
   *  6. Wait for the DataTable "Processing…" cycle to finish.
   *
   * Called inside scanAndSelect() so it runs on every scan pass — including
   * after goBack() + recursive scanAndSelect() calls which reset pagination.
   *
   * @param size - One of the sizes the app supports: 25 | 50 | 100 (default 50).
   */
  private async setTablePageSize(size: 25 | 50 | 100 = 50): Promise<void> {
    // 1. Scroll to the table length control. The app emits `.dataTables_length` (DataTables
    //    standard) and `.dt-length` (DataTables 2.x alias) — NOT `.dataTables_footer`.
    //    Confirmed from the theme's ta-datatables-length-flip.js:3 which anchors to
    //    '.dataTables_length select, .dt-length select, select[id^="dt-length-"]'.
    const footer = this.page.locator('.dataTables_length, .dt-length').first();
    if (await footer.isVisible({ timeout: 3000 }).catch(() => false)) {
      await footer.scrollIntoViewIfNeeded();
    }

    const menuBtn = this.page.locator('.ta-length-menu__btn').first();
    if (!await menuBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('setTablePageSize: .ta-length-menu__btn not visible — skipping.');
      return;
    }

    // 2. Skip if already at the desired size.
    const currentSize = (await menuBtn.textContent().catch(() => ''))?.trim();
    if (currentSize === String(size)) {
      return; // already correct — no click needed
    }

    console.log(`setTablePageSize: ${currentSize ?? '?'} → ${size} entries per page...`);

    // 3. Open the dropdown.
    await menuBtn.click();

    // 4. Wait for the menu container to receive .is-open
    //    (Bootstrap-style open signal — same pattern as the verdict drawer's .show class).
    await this.page
      .waitForFunction(
        () => !!document.querySelector('.ta-length-menu.is-open'),
        { timeout: 5000 },
      )
      .catch(() => {
        console.warn('setTablePageSize: .ta-length-menu.is-open not detected within 5s — attempting option click anyway.');
      });

    // 5. Click the matching option (exact text match — "50" must not match "100").
    const option = this.page
      .locator('.ta-length-menu__option')
      .filter({ hasText: new RegExp(`^${size}$`) })
      .first();
    await option.click();

    // 6. Wait in two stages:
    //    Stage A — waitForTableData() clears the Processing... overlay.
    //    Stage B — waitForFunction on menu-btn text + first row: confirms the DataTable
    //              committed the new page size (menu button shows "50").
    //    Stage C — waitForFunction on row count > default (10): the DataTable paints rows
    //              progressively; the menu-btn check fires after the FIRST row is painted
    //              but before the other 49 are ready. Waiting until count > 10 confirms
    //              the full expanded row set is actually in the DOM before the caller
    //              reads `count = await rows.count()`.
    await this.waitForTableData();
    const sizeStr = String(size);
    await this.page
      .waitForFunction(
        (expectedSize) => {
          const btn = document.querySelector('.ta-length-menu__btn');
          return btn?.textContent?.trim() === expectedSize && document.querySelector('tbody tr') !== null;
        },
        sizeStr,
        { timeout: 10000 },
      )
      .catch(() => {
        console.warn(`setTablePageSize: menu button did not show "${size}" within 10s — table may still be loading.`);
      });

    // Stage C: wait for more than the default 10 rows to be in the DOM.
    // waitForFunction resolves to a JSHandle<number> — r.valueOf() falls through to
    // Object.prototype.valueOf() and returns the handle itself (always truthy). Use
    // jsonValue() to extract the actual row count, then dispose the handle.
    const defaultPageSize = 10;
    const finalCount = await this.page
      .waitForFunction(
        (minRows) => {
          const rows = document.querySelectorAll('tbody tr');
          return rows.length > minRows ? rows.length : false;
        },
        defaultPageSize,
        { timeout: 15000 },
      )
      .then(async (r) => { const v = await r.jsonValue(); r.dispose(); return v; })
      .catch(() => {
        // Soft catch: the filtered view may genuinely have ≤ 10 rows (e.g. only 4
        // Under Review SRs exist). Log and proceed — the caller's count refresh will
        // read whatever rows are actually present.
        console.warn(`setTablePageSize: row count did not exceed ${defaultPageSize} within 15s — table may have fewer entries than requested.`);
        return null;
      });

    console.log(`setTablePageSize: now showing up to ${size} entries per page. ${finalCount ? `Actual count: ${finalCount}` : ''}`);
  }


  /** Navigates to Service Requests, reloads the table, and scrolls the page. */
  async navigateReloadAndScroll(): Promise<void> {
    await this.navigateToMyRequests();
    await this.waitForListToLoad();
    await this.reloadTableButton.first().click();
    await this.waitForTableData();
    await scrollFromTop(this.page);
  }

  async selectClosedRequest(): Promise<void> {
    // ── Wait for DataTable to finish its initial load cycle ───────────────────
    // waitForListToLoad() only confirms the Reload button is visible — the
    // DataTable rows may still be fetching. Wait for the full data cycle before
    // touching the length control or scanning rows.
    await this.waitForTableData();

    // ── Step 1: Expand the table ──────────────────────────────────────────────
    // The portal uses a custom .ta-length-menu__btn (hidden on storefront).
    // The storefront My Requests page shows the native .ta-length-menu__native select.
    const expanded = await this.tryExpandTableForStorefront(50);
    console.log(`selectClosedRequest: table expansion ${expanded ? 'succeeded' : 'skipped (no length control found)'}.`);

    // ── Step 2: Scan current page ─────────────────────────────────────────────
    const found = await this.scanPageForClosedRow();
    if (found) return;

    // ── Step 3: Closed filter pill ────────────────────────────────────────────
    const closedPill = this.page.getByRole('button', { name: /^Closed$/i, exact: true }).first();
    if (await closedPill.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('selectClosedRequest: applying Closed filter pill.');
      await closedPill.click();
      await this.waitForFilteredTableData();
      const found2 = await this.scanPageForClosedRow();
      if (found2) return;
    }

    // ── Step 4: Paginate — SR not found on the current (possibly expanded) page ───
    // This runs regardless of whether expansion succeeded: the SR may exist beyond
    // the first page even when 50 rows are shown (e.g. account has 63 closed SRs).
    console.log('selectClosedRequest: not found on the current page — paginating...');
    let pageNum = 2;
    while (true) {
      const nextBtn = this.page.locator('.paginate_button.next:not(.disabled), .dt-paging-button.next:not(.disabled)').first();
      if (!await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) break;
      await nextBtn.click();
      await this.waitForTableData();
      console.log(`selectClosedRequest: scanning page ${pageNum}...`);
      const found3 = await this.scanPageForClosedRow();
      if (found3) return;
      pageNum++;
      if (pageNum > 20) break; // safety limit
    }

    throw new Error(
      'selectClosedRequest: no Closed service request found after expanding table, checking filter pill, and paginating all pages. ' +
      'If this is a fresh test account, ensure at least one SR has been fully processed to Closed status before running this scenario.'
    );
  }

  /** Tries to expand the DataTable using the standard native <select> element (storefront fallback). */
  private async tryExpandTableForStorefront(size: number): Promise<boolean> {
    // First try the portal's custom length menu button
    const menuBtn = this.page.locator('.ta-length-menu__btn').first();
    if (await menuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await this.setTablePageSize(size as 25 | 50 | 100);
      return true;
    }

    // Storefront uses .ta-length-menu__native (visible select, confirmed from DOM).
    // The .ta-length-menu__btn is hidden on storefront — only the native select is shown.
    const nativeSelect = this.page.locator(
      'select.ta-length-menu__native, select[name*="DataTables_Table"], select[name*="dt-length"]'
    ).first();

    if (!await nativeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      return false;
    }

    const options = await nativeSelect.locator('option').allTextContents();
    // Pick the option closest to (but not exceeding) the requested size, or the largest available
    const bestOption = options
      .map(o => parseInt(o.trim(), 10))
      .filter(n => !isNaN(n))
      .reduce((best, n) => (n <= size && n > best ? n : best), -1);

    if (bestOption === -1) {
      // No option ≤ requested size — select the smallest available instead of returning false.
      const allNums = options.map(o => parseInt(o.trim(), 10)).filter(n => !isNaN(n)).sort((a, b) => a - b);
      const smallest = allNums[0];
      if (smallest === undefined) return false;
      console.log(`selectClosedRequest: no option ≤ ${size}, selecting smallest available: ${smallest}`);
      await nativeSelect.selectOption(String(smallest));
      await this.waitForTableData();
      return true;
    }

    const currentVal = await nativeSelect.inputValue().catch(() => '');
    if (currentVal === String(bestOption)) return true; // already at desired size

    console.log(`selectClosedRequest: expanding via native select → ${bestOption} rows per page`);
    await nativeSelect.selectOption(String(bestOption));
    await this.waitForTableData();
    return true;
  }

  /** Scans all currently visible tbody rows for a Closed SR and clicks it if found. */
  private async scanPageForClosedRow(): Promise<boolean> {
    const rows = this.page.locator('tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const text = await row.textContent().catch(() => '');
      if (!text?.toUpperCase().includes('CLOSED')) continue;
      const link = row.getByRole('link').first();
      if (!await link.isVisible().catch(() => false)) continue;
      console.log(`selectClosedRequest: found Closed SR at row ${i + 1}.`);
      await link.click();
      await this.page.waitForURL(/ServiceRequests\/Detail/i, {
        timeout: 30000,
        waitUntil: 'domcontentloaded',
      });
      await this.waitForLoaders();
      return true;
    }
    return false;
  }



  /** Returns the number of `.ta-reviewer-chip` elements on the current SR detail page. */
  private async getReviewerCount(): Promise<number> {
    const chips = this.page.locator('.ta-reviewer-chip');
    await chips.first().waitFor({ state: 'attached', timeout: 5000 }).catch((e: any) => { console.log(`  ℹ️ No reviewer chips attached: ${e.message}`); });
    const count = await chips.count().catch(() => 0);
    console.log(`  Reviewer chip count: ${count}`);
    return count;
  }

  /**
   * Navigates to Service Requests, finds an UNDER REVIEW SR, and opens it.
   *
   * @param requireSingleReviewer - Skip SRs with more than one reviewer chip.
   * @param requireMultiReviewer  - Skip SRs with only one reviewer chip.
   * Both default to false, preserving existing behaviour for all other callers.
   *
   * NOTE — prod safety: this method selects the first available UNDER REVIEW SR
   * with no ownership filter. This is intentional: the production tenant is
   * a dedicated QA tenant, not a live citizen-facing environment. Running
   * reject / revision / RAI / conditional flows against it does not affect any
   * real applicant's permit. If the target environment ever changes to a shared
   * live tenant this assumption must be revisited.
   */
  async selectActiveRequest(
    requireSingleReviewer = false,
    requireMultiReviewer = false,
    actionFn?: (href: string) => Promise<boolean>
  ): Promise<void> {
    await this.navigateReloadAndScroll();
    const visited = new Set<string>();
    // Tracks whether the "Under Review" filter pill has been applied.
    // setTablePageSize(50) runs:
    //  (a) at the top of scanAndSelect() on the very first filtered scan pass, and
    //  (b) inside the loop after every goBack() that resets the DataTable to 10 rows.
    // Using i=-1;continue to restart the loop does NOT re-execute the code before the
    // for-statement, so the in-loop call is the only reliable re-application point.
    let underReviewFilterActive = false;

    const scanAndSelect = async (): Promise<boolean> => {
      // First-pass expansion: runs once when scanAndSelect() is first called after
      // the Under Review filter is applied. Subsequent re-expansions happen inside
      // the loop immediately after each goBack() — see inline comments below.
      if (underReviewFilterActive) {
        await this.setTablePageSize(50);
      }

      const rows = this.page.locator('tbody tr');
      // `count` must be `let` so it can be refreshed after setTablePageSize expands
      // the table. `rows` is a live Locator (re-queried per .nth(i) call), but `count`
      // is a snapshot — without a refresh, the loop would iterate only the original
      // row count even after the DataTable expanded to 50 entries.
      let count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const text = await row.textContent().catch(() => '');
        if (!text?.includes('UNDER REVIEW')) continue;

        const link = row.getByRole('link').first();
        const href = await link.getAttribute('href').catch(() => null);
        // `visited` guards against re-selecting any SR the scanner already opened
        // (including ones where chip-check or actionFn caused a goBack and restart).
        if (!href || visited.has(href) || !await link.isVisible().catch(() => false)) continue;

        visited.add(href);
        await link.click();
        await this.page.waitForURL(/ServiceRequests\/(Detail|Activity)/i, {
          timeout: 30000, waitUntil: 'domcontentloaded',
        });

        const chipCount = await this.getReviewerCount();
        let valid = false;

        if (!requireSingleReviewer && !requireMultiReviewer) valid = true;
        else if (requireSingleReviewer && chipCount === 1) valid = true;
        else if (requireMultiReviewer && chipCount >= 2) valid = true;

        if (!valid) {
          const reason = requireSingleReviewer ? 'Multi-reviewer' : 'Single-reviewer';
          console.log(`  ⏭ ${reason} SR skipped (${href}). Going back...`);
          await this.page.goBack({ waitUntil: 'domcontentloaded' });
          await this.waitForTableData();
          // Re-expand to 50 rows if the Under Review filter is active.
          // goBack() resets DataTable pagination to 10 rows. The setTablePageSize(50)
          // call at the top of scanAndSelect() does NOT re-run when i=-1;continue
          // restarts the for-loop — it only executes before the loop starts. So this
          // in-loop call is the only reliable re-application point after each goBack().
          if (underReviewFilterActive) {
            await this.setTablePageSize(50);
          }
          // Refresh count after page-size change so the loop iterates all visible rows.
          count = await rows.count();
          i = -1;
          continue;
        }

        if (actionFn) {
          const success = await actionFn(href);
          if (success) {
            console.log(`  ✅ Action successfully triggered in SR: ${href}`);
            return true;
          }
          console.log(`  ⏭ Action declined in SR (${href}). Going back...`);
          // actionFn may have navigated deep into activities; navigate back directly.
          await this.navigateReloadAndScroll();
          // Re-apply the Under Review filter + page size if active.
          // navigateReloadAndScroll() loads fresh with no filter/page-size state.
          if (underReviewFilterActive) {
            const pill = this.page.getByRole('button', { name: 'Under Review', exact: true }).first();
            if (await pill.isVisible({ timeout: 5000 }).catch(() => false)) {
              await pill.click();
              await this.waitForFilteredTableData();
            }
            // Expand after filter is active (waitForFilteredTableData does not expand).
            await this.setTablePageSize(50);
          }
          // Refresh count after any page-size change and restart scan.
          count = await rows.count();
          i = -1;
          continue;
        }

        console.log(`  ✅ SR selected: ${href}`);
        return true;
      }

      return false;
    };

    if (await scanAndSelect()) return;

    console.log('No suitable UNDER REVIEW SR found in default view. Applying "Under Review" filter...');
    const filterPill = this.page.getByRole('button', { name: 'Under Review', exact: true }).first();
    if (await filterPill.isVisible({ timeout: 5000 }).catch(() => false)) {
      await filterPill.click();
      await this.waitForFilteredTableData();
      underReviewFilterActive = true; // flag scanAndSelect() to re-expand on every pass from here
      if (await scanAndSelect()) return;
    }

    throw new Error(
      requireSingleReviewer
        ? 'No single-reviewer UNDER REVIEW service request found (or action predicate failed).'
        : requireMultiReviewer
          ? 'No multi-reviewer UNDER REVIEW service request found (or action predicate failed).'
          : 'No service requests found with status UNDER REVIEW (or action predicate failed).'
    );
  }

  async openNextActiveActivity({ fastFail = false }: { fastFail?: boolean } = {}): Promise<boolean> {
    console.log('Landing on Service Request Details. Waiting for framework to load...');
    await this.page.waitForLoadState('domcontentloaded');
    await this.waitForLoaders();

    if (await this.page.getByText(/State Machine.*Closed/i).isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Service request is Closed. No more activities to process.');
      return false;
    }

    let openLink = this.page.locator('a.ta-actrow__open').first();
    let isVisible = await openLink.isVisible({ timeout: 10000 }).catch(() => false);

    if (!isVisible) {
      if (await this.page.getByText(/State Machine.*Closed/i).isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('Service request is Closed. No more activities to process.');
        return false;
      }
      // Recovery callers (from catch blocks in activity-revision.page.ts) pass fastFail
      // to skip the 3-retry reload loop below. Rationale: after a goBack() the detail
      // page is either ready in the initial 10s probe or it won't be — reloading three
      // more times burns the step's budget and lets Playwright replace the caller's
      // real error with 'Test timeout of 240000ms exceeded'.
      if (fastFail) return false;
      let retries = 0;
      while (retries < 3 && !isVisible) {
        retries++;
        console.log(`No active activity "Open" link found. Retrying... (Attempt ${retries}/3)`);
        // FIX: this wasn't a "hope the UI updated" sleep — it's a deliberate backoff before a
        // page reload, which is legitimate. But racing it against the link actually appearing
        // means a fast recovery doesn't still pay the full fixed delay before we try again.
        try {
          await openLink.waitFor({ state: 'visible', timeout: 1000 });
        } catch {
          // ignore, we just wait up to 1000ms for it to appear
        }
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
      await openLink.click({ timeout: 60000 });
      await this.page.waitForURL(/ServiceRequests\/Activity/i, {
        timeout: 60000, waitUntil: 'domcontentloaded',
      });
      await this.waitForLoaders();
      await this.page.locator('#ActivityVerdictButton')
        .waitFor({ state: 'visible', timeout: 30000 });
      return true;
    }

    return false;
  }

  /** Navigates to Service Requests and opens the SR matching the given tracking number. */
  async navigateToRequestByTrackingNumber(trackingNumber: string): Promise<void> {
    await this.navigateToMyRequests();
    if (!/ServiceRequests/i.test(this.page.url())) {
      await this.page.waitForURL(/ServiceRequests/i, { timeout: 30000, waitUntil: 'domcontentloaded' });
    }
    await this.waitForLoaders();

    const tryFindTrackingNumberInRows = async (): Promise<boolean> => {
      // Wait for the DataTable to finish its initial data load before touching the
      // search input. waitForLoaders() clears page-level spinners but the DataTable
      // initialises its search event listener asynchronously — filling before it's
      // bound is silently ignored (the table stays unfiltered, the row never appears).
      await this.waitForTableData();

      const searchInput = this.page.locator(
        'input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]'
      ).first();
      if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await searchInput.fill(trackingNumber);
        await this.waitForFilteredTableData();
      }

      const targetRow = this.page.locator('tbody tr').filter({ hasText: trackingNumber }).first();
      if (await targetRow.isVisible({ timeout: 10000 }).catch(() => false)) {
        await targetRow.getByRole('link').first().click();
        await this.waitForLoaders();
        return true;
      }

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

    if (await tryFindTrackingNumberInRows()) return;

    console.log(`"${trackingNumber}" not found in first-page rows. Applying Under Review filter...`);
    const filterPill = this.page.getByRole('button', { name: 'Under Review', exact: true }).first();
    if (await filterPill.isVisible({ timeout: 5000 }).catch(() => false)) {
      await filterPill.click();
      await this.waitForFilteredTableData();

      const searchInput = this.page.locator(
        'input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]'
      ).first();
      if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await searchInput.fill(trackingNumber);
        await this.waitForFilteredTableData();
      }

      const targetRow = this.page.locator('tbody tr').filter({ hasText: trackingNumber }).first();
      if (await targetRow.isVisible({ timeout: 10000 }).catch(() => false)) {
        await targetRow.getByRole('link').first().click();
        await this.waitForLoaders();
        return;
      }

      const rows = this.page.locator('tbody tr');
      const count = await rows.count().catch(() => 0);
      console.log(`Traversing all ${count} row(s) in Under Review filtered table...`);
      for (let i = 0; i < count; i++) {
        const rowText = await rows.nth(i).textContent().catch(() => '');
        console.log(`  Row ${i + 1}/${count}: ${rowText?.trim().substring(0, 80)}`);
        if (rowText?.includes(trackingNumber)) {
          console.log(`  ✓ Match at row ${i + 1}. Clicking link...`);
          await rows.nth(i).getByRole('link').first().click();
          await this.waitForLoaders();
          return;
        }
      }

      console.log(`"${trackingNumber}" not found after traversing all ${count} Under Review row(s).`);
    }

    throw new Error(`Service Request with tracking number "${trackingNumber}" not found.`);
  }

  /**
   * Navigates to Service Requests, finds a Pending Intake SR that is actionable
   * by the Coordinator (has unassigned steps OR is ready to launch), and opens it.
   */
  async findAndOpenPendingIntakeSR(): Promise<void> {
    await this.navigateReloadAndScroll();
    const visited = new Set<string>();

    const scanAndOpen = async (): Promise<boolean> => {
      const rows = this.page.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const text = await row.textContent().catch(() => '');
        if (!text?.includes('PENDING INTAKE')) continue;

        const link = row.getByRole('link').first();
        const href = await link.getAttribute('href').catch(() => null);
        if (!href || visited.has(href) || !await link.isVisible().catch(() => false)) continue;

        visited.add(href);
        await link.click();
        await this.page.waitForURL(/ServiceRequests\/Detail/i, {
          timeout: 30000, waitUntil: 'domcontentloaded',
        });

        // Usable if unassigned steps remain (assign + launch) OR all assigned (launch only)
        const hasUnassigned = await this.page.locator('button.js-assign-reviewer').first()
          .isVisible({ timeout: 5000 }).catch(() => false);
        const canLaunch = await this.page.locator('button.js-launch-review-mirror, button#LaunchReviewButton').first()
          .isVisible({ timeout: 5000 }).catch(() => false);

        if (hasUnassigned) {
          console.log(`✅ Pending Intake SR with unassigned steps opened: ${href}`);
          return true;
        }
        if (canLaunch) {
          console.log(`✅ Pending Intake SR fully assigned (ready to launch): ${href}`);
          return true;
        }

        console.log(`⏭ SR is not actionable by Coordinator (${href}). Going back...`);
        await this.page.goBack({ waitUntil: 'domcontentloaded' });
        await this.waitForTableData();
        return scanAndOpen();
      }

      return false;
    };

    if (await scanAndOpen()) return;

    console.log('No suitable Pending Intake SR found in default view. Applying filter...');
    const pill = this.page.getByRole('button', { name: 'Pending Intake', exact: true }).first();
    if (await pill.isVisible({ timeout: 5000 }).catch(() => false)) {
      await pill.click();
      await this.waitForFilteredTableData();
      if (await scanAndOpen()) return;
    }

    throw new Error('No actionable Pending Intake SR found (needs unassigned steps or ready-to-launch state).');
  }
}
