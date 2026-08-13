import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page object for the SR Detail view — shared by Citizen, Reviewer, and Dual-reviewer flows.
 * Sits at pages/ root (alongside base.page.ts) to make its shared nature explicit.
 *
 * Covers interactions that happen AFTER an SR has been opened from the list:
 * tabs, documents, status history, tracking number, and reviewer-step inspection.
 */
export class SRDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** Asserts the SR detail page shows "Request Status Closed". */
  async verifyRedirectedToClosedRequest(): Promise<void> {
    await expect(this.page.getByText('Request Status Closed')).toBeVisible();
  }

  /** Opens the Status History offcanvas, confirms the timeline heading, then closes it. */
  async viewStatusHistory(): Promise<void> {
    const link = this.page.getByRole('link', { name: 'View status history' });
    await expect(link).toBeVisible();
    await link.click();

    const heading = this.page.getByRole('heading', { name: 'Status timeline' });
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Wait for the offcanvas open animation — .show on the panel is the real completion
    // signal (same pattern as verdict drawer). A fixed sleep is simultaneously too slow
    // locally and too fast on a loaded CI runner.
    await this.page.waitForFunction(
      () => !!document.querySelector('#ta-sr-status-history-panel.show, .offcanvas.show'),
      { timeout: 10000 },
    ).catch(() => console.warn('viewStatusHistory: .offcanvas.show not detected within 10s — proceeding.'));

    // Target the exact offcanvas close button visible in the DOM:
    // <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
    // inside #ta-sr-status-history-panel / .offcanvas.show
    const closeBtn = this.page.locator(
      '#ta-sr-status-history-panel .btn-close, .offcanvas.show .btn-close, button[data-bs-dismiss="offcanvas"]'
    ).first();

    if (await closeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await closeBtn.click();
    } else {
      const closeByLabel = this.page.getByRole('button', { name: /^Close$/i }).first();
      if (await closeByLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
        await closeByLabel.click();
      } else {
        await this.page.keyboard.press('Escape');
      }
    }

    // Confirm panel is gone and allow closing animation to settle before proceeding
    await heading.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {
      console.warn('viewStatusHistory: sidebar heading still visible after close attempt.');
    });
    // heading.waitFor({ state: 'hidden' }) is the real completion signal — no additional sleep needed.
  }

  /** Clicks a named tab on the SR detail page. Tries role="tab" first, falls back to text match. */
  async selectTab(tabName: string): Promise<void> {
    let tab = this.page.getByRole('tab', { name: new RegExp(tabName, 'i') });
    if (!await tab.isVisible().catch(() => false))
      tab = this.page.getByText(new RegExp(tabName, 'i')).first();

    if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tab.scrollIntoViewIfNeeded();
      await tab.click();
      await this.page.waitForTimeout(1000);
    } else {
      console.log(`Warning: Tab '${tabName}' not found or not visible.`);
    }
  }

  /** Clicks every Download Document button and returns the resulting Download objects. */
  async downloadAllDocuments(): Promise<unknown[]> {
    const buttons = this.page.getByRole('button', { name: 'Download document' });
    const count = await buttons.count();
    const downloads: unknown[] = [];
    for (let i = 0; i < count; i++) {
      const downloadPromise = this.page.waitForEvent('download', { timeout: 80000 });
      await buttons.nth(i).click();
      downloads.push(await downloadPromise);
    }
    return downloads;
  }

  /**
   * Reads the SR tracking number from the breadcrumb, falling back to the page heading.
   * Returns an empty string when neither source yields a value.
   */
  async getTrackingNumber(): Promise<string> {
    const breadcrumb = await this.page.locator('.breadcrumb-item').last().textContent().catch(() => '');
    if (breadcrumb?.trim()) {
      console.log(`Captured tracking number: ${breadcrumb.trim()}`);
      return breadcrumb.trim();
    }
    const heading = await this.page.locator('h1, .page-title').first().textContent().catch(() => '');
    console.log(`Captured tracking number from heading: ${heading?.trim()}`);
    return heading?.trim() ?? '';
  }

  /**
   * On the SR detail page, finds the first ACTIVE activity step that the currently
   * logged-in reviewer CANNOT open (no `a.ta-actrow__open` link) and returns the
   * username of the reviewer it is assigned to.
   *
   * Title attribute format: "SandeepP (Active)" — the username is the portion before " (".
   * Returns null when no blocking step is found.
   *
   * Used by the dual-reviewer flow to detect when account-switching is needed.
   */
  async getActiveStepAssignedReviewer(): Promise<string | null> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.waitForLoaders();

    const blockedLanes = this.page.locator('.ta-activity-lane--st-active:not(:has(a.ta-actrow__open))');
    if (await blockedLanes.count().catch(() => 0) === 0) return null;

    const title = await blockedLanes.first()
      .locator('span.ta-actrow__avatar[title]')
      .getAttribute('title')
      .catch(() => null);
    if (!title) return null;

    const username = title.split(' (')[0].trim();
    console.log(`  Blocked active step assigned to: "${username}" (full title: "${title}")`);
    return username || null;
  }
}
