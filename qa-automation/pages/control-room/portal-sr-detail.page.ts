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

      // CORRECTION: the jQuery `$._data(btn, 'events')` check I added previously does NOT
      // apply to this button — confirmed via trace: it burned the full 15000ms timeout and
      // never resolved true, which is exactly why the click appeared to fire "very late."
      // button.js-assign-reviewer evidently isn't wired the same way as #ActivityVerdictButton
      // (different framework/binding mechanism), so generalizing that pattern here was wrong.
      // Removed it — the retry-click loop just below already handles registration correctly on
      // its own (confirmed in the latest trace: attempt 1 didn't open the offcanvas, a real
      // `waitFor` correctly detected that after its full 1500ms, and attempt 2 succeeded —
      // exactly the intended behavior, with no duplicate-request storm).

      const offcanvasBody = this.page.locator('div.offcanvas-body').last();

      // FIX: the previous version retried the click after only 1500ms — too short, since this
      // offcanvas has been observed taking 1.3-3.9s to genuinely open. Retrying that fast meant
      // clicking the SAME button again while the FIRST click's offcanvas backdrop was still
      // mid-transition, which then covered the button — confirmed via trace: the second click()
      // call itself hung for the full 15000ms because Playwright's actionability check kept
      // waiting for the target to stop being obscured, which never resolved in time. Now: one
      // click, one genuinely patient wait, and only retry if that really failed — with a bounded
      // click timeout so a real block fails fast and visibly instead of hanging.
      await assignButtons.first().click({ timeout: 5000 });
      let opened = await offcanvasBody
        .waitFor({ state: 'visible', timeout: 8000 })
        .then(() => true)
        .catch(() => false);

      if (!opened) {
        console.log('  ↻ Offcanvas did not open after 8s — checking for a stuck backdrop before retrying...');
        // If a backdrop is genuinely stuck, clicking again would just repeat the same hang.
        // Wait for any backdrop to clear (or confirm there isn't one) before the retry click.
        await this.page.locator('.offcanvas-backdrop').first()
          .waitFor({ state: 'hidden', timeout: 3000 }).catch((e: any) => { console.log(`  ℹ️ No offcanvas backdrop to hide: ${e.message}`); });
        await assignButtons.first().click({ timeout: 5000 }).catch((e) => {
          console.log(`  ⚠️ Retry click also failed: ${e.message}`);
        });
        opened = await offcanvasBody
          .waitFor({ state: 'visible', timeout: 10000 })
          .then(() => true)
          .catch(() => false);
      }

      if (!opened) {
        throw new Error(`AssignReviewer offcanvas failed to open after retry for step ${i + 1}.`);
      }
      // FIX: replaced fixed 4000ms "let offcanvas animation + initial list load settle" sleep
      // with a real wait on the reviewer list actually being populated — either a reviewer
      // option is present, or a "loading" indicator inside the offcanvas has cleared. This
      // waits exactly as long as the list genuinely takes instead of guessing a duration.
      await Promise.race([
        offcanvasBody.locator('label.js-reviewer-option').first().waitFor({ state: 'visible', timeout: 8000 }),
        offcanvasBody.locator('.spinner-border, .loading, [class*="loading"]').first()
          .waitFor({ state: 'hidden', timeout: 8000 }),
      ]).catch(() => {
        console.log('  ⚠️ Reviewer list did not confirm ready within 8s — proceeding anyway.');
      });

      // Type the username into the search box — the server filters the list,
      // surfacing Reviewer3 / SandeepP without requiring virtual-list scrolling
      const searchInput = offcanvasBody
        .locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]')
        .first();
      await searchInput.waitFor({ state: 'visible', timeout: 5000 });

      // FIX (root cause, confirmed via live DevTools inspection — getEventListeners($0) showed
      // only one 'input' listener, and manually testing in the browser proved this search box
      // does NOT filter live at all: you must type, then explicitly click the button titled
      // "Reload form list" (id="ReviewerPickerRefresh") to apply the filter. No amount of
      // correctly-simulated typing could ever have fixed this — typing was never the trigger.
      await searchInput.fill(reviewerUsername);

      // FIX: trace showed only a 64ms gap between fill() finishing and the reload button click
      // — too tight if the app's internal JS state (React/Angular-style binding) commits the
      // typed value asynchronously relative to the 'input' event fill() dispatches. There is no
      // DOM-observable signal for "the app has registered what I typed" (confirmed via
      // getEventListeners: only one plain 'input' listener, no loading indicator appears between
      // typing and reload) — so unlike the sleeps removed elsewhere in this codebase, there's no
      // real wait to substitute here. Two things, in order: (1) blur the field first, a genuine
      // triggering action in case the binding commits on blur rather than on 'input' — this is
      // not a guess-and-wait, it's testing a real mechanism; (2) a short, explicitly-documented
      // bounded wait as the honest fallback for the remaining async-state-commit window.
      await searchInput.blur().catch((e: any) => { console.log(`  ℹ️ Could not blur search input: ${e.message}`); });
      await this.page.waitForTimeout(400);

      const reloadButton = offcanvasBody.locator('#ReviewerPickerRefresh, button[title="Reload form list"]').first();
      await reloadButton.waitFor({ state: 'visible', timeout: 3000 });

      // Sanity check: confirm the search box still holds what we typed right before reloading —
      // if a blur handler cleared or reset it, we want to know that explicitly rather than
      // silently reload with an empty/wrong filter.
      const currentValue = await searchInput.inputValue().catch(() => '');
      if (currentValue !== reviewerUsername) {
        console.log(`  ⚠️ Search box shows "${currentValue}" instead of "${reviewerUsername}" right before reload — re-filling.`);
        await searchInput.fill(reviewerUsername);
        await this.page.waitForTimeout(400);
      }

      const reviewerLabelLocator = offcanvasBody
        .locator('label.js-reviewer-option')
        .filter({ hasText: reviewerUsername })
        .first();

      // FIX: under increased server load, a single reload click sometimes returns before the
      // name is actually filterable (confirmed by observation: works fine on steps 1-2, then
      // fails after the reload click on step 3 as load increases). Rather than fail outright,
      // retry the reload click itself — each retry gets its own real wait on both the network
      // response and the label appearing, so this scales with actual server responsiveness
      // instead of assuming one attempt is always enough.
      let filtered = false;
      const maxReloadAttempts = 3;
      for (let reloadAttempt = 1; reloadAttempt <= maxReloadAttempts; reloadAttempt++) {
        await this.waitForNetworkResponse(
          /assignable-reviewers\/list/i,
          async () => { await reloadButton.click(); },
          8000
        ).catch((e) => {
          console.log(`  ⚠️ Reload request not detected (attempt ${reloadAttempt}/${maxReloadAttempts}): ${e.message}`);
        });

        filtered = await reviewerLabelLocator
          .waitFor({ state: 'visible', timeout: 8000 })
          .then(() => true)
          .catch(() => false);

        if (filtered) {
          if (reloadAttempt > 1) {
            console.log(`  ✅ "${reviewerUsername}" appeared after retry ${reloadAttempt}.`);
          }
          break;
        }

        console.log(`  ↻ "${reviewerUsername}" not yet in the filtered list after reload attempt ${reloadAttempt}/${maxReloadAttempts}${reloadAttempt < maxReloadAttempts ? ' — retrying...' : '.'}`);
      }

      if (!filtered) {
        throw new Error(`"${reviewerUsername}" did not appear in the filtered reviewer list after ${maxReloadAttempts} reload attempts.`);
      }
      console.log(`  🔍 Found "${reviewerUsername}" in reviewer picker.`);

      // Click the reviewer label from the filtered result
      const reviewerLabel = reviewerLabelLocator;
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
      await offcanvasBody.waitFor({ state: 'hidden', timeout: 30000 });

      // FIX: replaced the stacked fixed 4000ms + 1300ms sleeps with the correct busy-overlay
      // pattern already used correctly in launchReview() below: wait for the overlay to
      // actually become visible first (bounded — the save may be fast enough that it never
      // shows), THEN wait for it to clear. The old code went straight to waitFor({state:
      // 'hidden'}) on an overlay that likely hadn't appeared yet, which resolves instantly
      // and doesn't prove anything — hence needing two guessed sleeps to paper over it.
      const overlay = this.page.locator('div.abp-block-area.abp-block-area-busy');
      await overlay.waitFor({ state: 'visible', timeout: 6000 }).catch((e: any) => { console.log(`  ℹ️ Overlay did not become visible (fast save): ${e.message}`); });
      await overlay.waitFor({ state: 'hidden', timeout: 30000 });

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
    // Wait for smooth scroll to complete (scrollY == 0) rather than a fixed sleep.
    await this.page.waitForFunction(() => window.scrollY === 0, { timeout: 5000 }).catch(() => {
      console.log('  ⚠️ Scroll-to-top did not confirm within 5s — proceeding anyway.');
    });

    // Prefer the fixed header button (always in viewport after scroll-to-top);
    // fall back to the "Next Action" mirror button if the header button isn't present.
    const headerBtn = this.page.locator('button#LaunchReviewButton').first();
    const mirrorBtn = this.page.locator('button.js-launch-review-mirror').first();

    // Determine which button to use — wait up to 10s for either to become visible.
    let btnToClick = headerBtn;
    const headerVisible = await headerBtn.isVisible({ timeout: 10000 }).catch(() => false);
    if (!headerVisible) {
      console.log('  ℹ️ Header Launch Review button not visible — trying Next Action panel button.');
      const mirrorVisible = await mirrorBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (!mirrorVisible) {
        throw new Error('Neither #LaunchReviewButton nor .js-launch-review-mirror is visible — cannot launch review.');
      }
      btnToClick = mirrorBtn;
    }

    // Scroll the chosen button into view and wait for it to be enabled.
    await btnToClick.scrollIntoViewIfNeeded();
    await btnToClick.waitFor({ state: 'visible', timeout: 5000 });
    await expect(btnToClick).toBeEnabled({ timeout: 5000 });

    await btnToClick.click();
    console.log('Clicked Launch Review — waiting for confirmation popup...');

    const swalConfirm = this.page.locator('button.swal2-confirm');
    
    // Check if the popup appears. If it does not appear within 8 seconds,
    // we only retry the click if the Launch Review button is still actionable
    // (i.e. the click didn't trigger an overlay or navigation).
    try {
      await swalConfirm.waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      console.log('  ⚠️ Popup did not appear after 8s — checking if button is still actionable before retrying...');
      if (await btnToClick.isVisible() && await btnToClick.isEnabled()) {
        await btnToClick.scrollIntoViewIfNeeded();
        await btnToClick.click();
        await swalConfirm.waitFor({ state: 'visible', timeout: 10000 });
      } else {
        throw new Error('Popup did not appear, but Launch button is no longer clickable (page may have navigated or is loading).');
      }
    }

    await swalConfirm.click();
    console.log('Confirmed "Launch review" in popup.');

    // Wait for the ABP loading overlay to appear then fully disappear.
    const overlay = this.page.locator('div.abp-block-area.abp-block-area-busy');
    await overlay.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
      console.log('  ℹ️ ABP overlay did not appear (fast response) — continuing.');
    });
    await overlay.waitFor({ state: 'hidden', timeout: 60000 });

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