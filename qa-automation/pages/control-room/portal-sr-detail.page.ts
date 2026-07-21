import { Page, expect } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * Page object for the SR Detail page in the Control Room portal.
 * Handles Coordinator actions: assigning reviewers to activity steps
 * and launching the review.
 */
export class PortalSRDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** Returns the number of unassigned activity steps (AssignReviewer buttons still visible). */
  async getPendingStepCount(): Promise<number> {
    await this.page.waitForLoadState('domcontentloaded');
    const count = await this.page.locator('button.js-assign-reviewer').count().catch(() => 0);
    console.log(`📋 Pending step count: ${count}`);
    return count;
  }

  /**
   * Assigns activity steps to a reviewer.
   * Uses the offcanvas search box to filter reviewers by username —
   * this surfaces lazy-loaded names (Reviewer3, SandeepP) without
   * needing to scroll a virtual list.
   *
   * @param reviewerUsername  Username from .env e.g. "SandeepP" or "Reviewer3"
   * @param count             Steps to assign. -1 = all remaining.
   */
  async assignReviewerToSteps(reviewerUsername: string, count = -1): Promise<void> {
    const assignButtons = this.page.locator('button.js-assign-reviewer');
    const totalToAssign = count === -1
      ? await assignButtons.count()
      : count;

    console.log(`🔖 Assigning ${count === -1 ? 'all remaining' : count} step(s) to "${reviewerUsername}"...`);

    for (let i = 0; i < totalToAssign; i++) {
      // Guard: re-check button exists before each iteration —
      // count at start may exceed actual visible buttons if page re-renders
      const btnVisible = await assignButtons.first().isVisible({ timeout: 5000 }).catch(() => false);
      if (!btnVisible) {
        console.log(`  ℹ️ No more AssignReviewer buttons after ${i} step(s). All done.`);
        break;
      }

      const offcanvasBody = this.page.locator('div.offcanvas-body').last();

      // If the page is still settling, the first click may be ignored.
      // Retry the assignment click until the offcanvas opens.
      for (let attempt = 0; attempt < 3; attempt++) {
        await assignButtons.first().click();
        const opened = await offcanvasBody.isVisible({ timeout: 1500 }).catch(() => false);
        if (opened) {
          break;
        }
        console.log(`  ↻ Offcanvas did not open on attempt ${attempt + 1}; retrying...`);
        await this.page.waitForTimeout(500);
      }

      // Wait for the offcanvas body to slide open
      await offcanvasBody.waitFor({ state: 'visible', timeout: 15000 });
      await this.page.waitForTimeout(4000); // let offcanvas animation + initial list load settle

      // Type the username into the search box — the server filters the list,
      // surfacing Reviewer3 / SandeepP without requiring virtual-list scrolling
      const searchInput = offcanvasBody
        .locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]')
        .first();
      await searchInput.waitFor({ state: 'visible', timeout: 5000 });
      await searchInput.fill(reviewerUsername);
      await this.page.waitForTimeout(2000); // wait for server to return filtered results
      console.log(`  🔍 Searched for "${reviewerUsername}" in reviewer picker.`);

      // Click the reviewer label from the filtered result
      const reviewerLabel = offcanvasBody
        .locator('label.js-reviewer-option')
        .filter({ hasText: reviewerUsername })
        .first();
      await reviewerLabel.waitFor({ state: 'visible', timeout: 10000 });
      await reviewerLabel.click();

      // Submit the selection
      const assignBtn = this.page
        .locator('button[type="submit"]:has-text("Assign"), button.btn-primary:has-text("Assign")')
        .last();
      await assignBtn.waitFor({ state: 'visible', timeout: 5000 });
      await assignBtn.click();

      // Wait for offcanvas to fully close, then let the page re-render
      // activity steps before clicking the next AssignReviewer button.
      await offcanvasBody.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => { });
      await this.page.waitForTimeout(4000); // Increased to let page re-render assigned step chip safely

      const overlay = this.page.locator('div.abp-block-area.abp-block-area-busy');
      await overlay.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => { });

      // Give the page a brief moment to settle before the next assignment click.
      await this.page.waitForTimeout(1300);

      console.log(`  ✅ Step ${i + 1} assigned to "${reviewerUsername}"`);
    }
  }



  /**
   * Scrolls to the top of the page, clicks the Launch Review button,
   * confirms the SweetAlert2 popup, then waits for the loading overlay
   * to finish before returning.
   *
   * The Launch Review button lives in the "Next Action" panel at the top
   * of the detail page — a scroll-to-top is needed because the coordinator
   * may have scrolled down while assigning steps.
   */
  async launchReview(): Promise<void> {
    // Scroll to top so both Launch Review buttons are accessible
    await this.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await this.page.waitForTimeout(3000);

    // Try the mirror button (Next Action panel) first;
    // fall back to the fixed top-right header button (#LaunchReviewButton)
    const mirrorBtn = this.page.locator('button.js-launch-review-mirror').first();
    const headerBtn = this.page.locator('button#LaunchReviewButton').first();

    let clicked = false;
    if (await mirrorBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await mirrorBtn.click();
      clicked = true;
    } else if (await headerBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await headerBtn.click();
      clicked = true;
    }

    if (!clicked) {
      // Last resort: wait longer for either button
      await Promise.race([
        mirrorBtn.waitFor({ state: 'visible', timeout: 15000 }).then(() => mirrorBtn.click()),
        headerBtn.waitFor({ state: 'visible', timeout: 15000 }).then(() => headerBtn.click()),
      ]);
    }
    console.log('Clicked Launch Review — waiting for confirmation popup...');

    // SweetAlert2 confirm button — exact class from DevTools screenshot
    const swalConfirm = this.page.locator('button.swal2-confirm');
    await swalConfirm.waitFor({ state: 'visible', timeout: 10000 });
    await swalConfirm.click();
    console.log('Confirmed "Launch review" in popup.');

    // Wait for the ABP loading overlay to appear then fully disappear
    const overlay = this.page.locator('div.abp-block-area.abp-block-area-busy');
    await overlay.waitFor({ state: 'visible', timeout: 10000 }).catch(() => { });
    await overlay.waitFor({ state: 'hidden', timeout: 60000 }).catch(() => { });

    console.log('✅ Review launched — workflow is now active.');
  }


  /**
   * Asserts the State Machine subtitle shows "Under Review".
   * Selector: <div class="ta-state-machine__subtitle">· <strong>Under Review</strong></div>
   */
  async verifyUnderReview(): Promise<void> {
    await expect(
      this.page.locator('.ta-state-machine__subtitle strong')
    ).toHaveText('Under Review', { timeout: 20000 });
    console.log('✅ State Machine status: Under Review confirmed.');
  }
}
