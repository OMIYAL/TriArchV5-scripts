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
    this.serviceRequestsLink = page.getByRole('link', { name: /Service Requests|My Requests/ });
    this.reloadTableButton = page.getByRole('button', { name: 'Reload table' });
  }

  async navigateToMyRequests(): Promise<void> {
    if (/ControlRoom\/ServiceRequests\/?(\?|$)/i.test(this.page.url())) return;
    await expect(this.serviceRequestsLink).toBeVisible({ timeout: 15000 });
    await this.serviceRequestsLink.click();
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

  /** Navigates to Service Requests, reloads the table, and scrolls the page. */
  async navigateReloadAndScroll(): Promise<void> {
    await this.navigateToMyRequests();
    await this.waitForListToLoad();
    await this.reloadTableButton.first().click();
    await this.waitForTableData();
    await scrollFromTop(this.page);
  }

  async selectClosedRequest(): Promise<void> {
    await expect(this.page.getByRole('cell', { name: 'Closed' }).first()).toBeVisible();
    const closedRows = this.page.getByRole('row').filter({ hasText: 'Closed' });
    await closedRows.first().getByRole('link').first().click();
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
   */
  async selectActiveRequest(requireSingleReviewer = false, requireMultiReviewer = false): Promise<void> {
    await this.navigateReloadAndScroll();
    const visited = new Set<string>();

    const scanAndSelect = async (): Promise<boolean> => {
      const rows = this.page.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const text = await row.textContent().catch(() => '');
        if (!text?.includes('UNDER REVIEW')) continue;

        const link = row.getByRole('link').first();
        const href = await link.getAttribute('href').catch(() => null);
        if (!href || visited.has(href) || !await link.isVisible().catch(() => false)) continue;

        visited.add(href);
        await link.click();
        await this.page.waitForURL(/ServiceRequests\/(Detail|Activity)/i, {
          timeout: 30000, waitUntil: 'domcontentloaded',
        });

        if (!requireSingleReviewer && !requireMultiReviewer) return true;

        const chipCount = await this.getReviewerCount();
        if (requireSingleReviewer && chipCount === 1) {
          console.log(`  ✅ Single-reviewer SR selected: ${href}`);
          return true;
        }
        if (requireMultiReviewer && chipCount >= 2) {
          console.log(`  ✅ Multi-reviewer SR (${chipCount} reviewers) selected: ${href}`);
          return true;
        }

        const reason = requireSingleReviewer ? 'Multi-reviewer' : 'Single-reviewer';
        console.log(`  ⏭ ${reason} SR skipped (${href}). Going back...`);
        await this.page.goBack({ waitUntil: 'domcontentloaded' });
        await this.waitForTableData();
        return scanAndSelect();
      }

      return false;
    };

    if (await scanAndSelect()) return;

    console.log('No suitable UNDER REVIEW SR found in default view. Applying "Under Review" filter...');
    const filterPill = this.page.getByRole('button', { name: 'Under Review', exact: true }).first();
    if (await filterPill.isVisible({ timeout: 5000 }).catch(() => false)) {
      await filterPill.click();
      await this.waitForFilteredTableData();
      if (await scanAndSelect()) return;
    }

    throw new Error(
      requireSingleReviewer
        ? 'No single-reviewer UNDER REVIEW service request found.'
        : requireMultiReviewer
          ? 'No multi-reviewer UNDER REVIEW service request found.'
          : 'No service requests found with status UNDER REVIEW.'
    );
  }

  async openNextActiveActivity(): Promise<boolean> {
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
        .waitFor({ state: 'visible', timeout: 30000 })
        .catch(() => { console.log('Warning: #ActivityVerdictButton not visible after opening activity.'); });
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
