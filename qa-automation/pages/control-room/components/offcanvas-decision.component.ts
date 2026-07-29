import { expect, Page, Locator } from '@playwright/test';
import { BasePage } from '../../base.page';
import { GeneralReviewComponent } from './general-review.component';

export class OffcanvasDecisionComponent extends BasePage {
  private readonly drawer: Locator;

  constructor(page: Page) {
    super(page);
    this.drawer = page.locator('#activity-verdict-drawer');
  }

  private get decisionBody() {
    // Look for offcanvas body or modal body, fallback to drawer itself
    return this.drawer.locator('.offcanvas-body, .modal-body, .drawer-body').first();
  }

  /**
   * Identifies the actual DOM element sitting on top of a locator's click point, if any.
   * Same elementFromPoint pattern already used in packaging.component.ts. Used to surface
   * *why* a click didn't land (e.g. a sticky toolbar) instead of silently bypassing the
   * browser's real click dispatch with a jQuery-triggered synthetic event.
   */
  private async describeBlocker(locator: Locator): Promise<string | null> {
    const handle = await locator.elementHandle().catch(() => null);
    if (!handle) return null;
    return this.page.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const topEl = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      if (!topEl || topEl === el || el.contains(topEl)) return null;
      return topEl.outerHTML.slice(0, 200);
    }, handle).catch(() => null);
  }

  /**
   * Opens the ABP ActivityVerdictDrawer offcanvas.
   * The drawer is loaded lazily — #activity-verdict-drawer does not exist until open() succeeds.
   * Sticky toolbars often intercept normal Playwright clicks on #ActivityVerdictButton, so we
   * force-click first; if the drawer still doesn't open, we scroll clear of the toolbar and
   * retry with a real click rather than bypassing the browser's event dispatch entirely.
   */
  private async openDecisionDrawer(): Promise<void> {
    if (await this.drawer.isVisible({ timeout: 2000 }).catch(() => false)) return;

    const verdictBtn = this.page.locator('#ActivityVerdictButton');
    const fallbackBtn = this.page.locator('.ta-acthdr__submit-btn, button:has-text("Submit Decision")')
      .filter({ visible: true }).first();

    const btnVisible = await verdictBtn.isVisible({ timeout: 8000 }).catch(() => false);
    const btnToClick = btnVisible
      ? verdictBtn
      : await fallbackBtn.isVisible({ timeout: 3000 }).catch(() => false)
        ? fallbackBtn
        : null;

    if (!btnToClick) {
      console.log('No Submit Decision button found. Waiting up to 30s for drawer...');
      await this.drawer.waitFor({ state: 'visible', timeout: 30000 });
      return;
    }

    // Ensure the Activity page script has bound the jQuery click handler before we click.
    await this.page.waitForFunction(
      () => {
        const btn = document.querySelector('#ActivityVerdictButton');
        const $ = (window as any).jQuery;
        if (!btn || !$) return !!document.querySelector('#activity-verdict-drawer.show');
        const events = $._data?.(btn, 'events');
        return !!(events && events.click && events.click.length);
      },
      { timeout: 15000 }
    ).catch(() => {
      console.log('Warning: ActivityVerdictButton click handler not confirmed within 15s.');
    });

    // Dismiss leftover concurrency / warning dialogs before opening the drawer.
    const swalOk = this.page.locator('.swal2-confirm').first();
    if (await swalOk.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log('Dismissing leftover alert before opening decision drawer...');
      await swalOk.click();
      // FIX: replaced fixed 500ms settle sleep with an explicit wait for the alert container
      // itself to actually disappear — the real completion signal for a dismissed dialog.
      await this.page.locator('.swal2-popup').first().waitFor({ state: 'hidden', timeout: 15000 });
    }

    console.log('Clicking Submit Decision button to open decision drawer...');
    // Sticky lpx toolbar / content toolbar intercepts normal clicks on Fee and similar steps.
    await btnToClick.click({ force: true });

    let opened = await this.drawer
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);

    if (!opened) {
      // Dismiss any incomplete-steps / concurrency warning that blocks the drawer
      if (await swalOk.isVisible({ timeout: 1500 }).catch(() => false)) {
        const msg = await this.page.locator('.swal2-html-container, .swal2-content').textContent().catch(() => '');
        console.log(`Dismissing decision warning: ${msg?.trim() || '(no message)'}`);
        await swalOk.click();
      }

      // FIX: previously fell back to `$(btn).trigger('click')` here — a synthetic jQuery
      // event that fires the bound handler directly, bypassing the browser's real hit-testing
      // and click dispatch entirely. That means it "succeeds" even when a sticky toolbar is
      // genuinely covering the button — exactly the defect a real user would also hit — so the
      // interception bug stayed invisible behind a passing test.
      //
      // Instead: scroll clear of the sticky toolbar and retry with a REAL click — still real
      // browser events, not a bypass. If it still fails, report exactly what's covering the
      // button so the interception can be filed as a real app bug instead of hidden.
      console.log('Drawer not visible after force-click — scrolling clear of sticky toolbar and retrying...');
      await btnToClick.scrollIntoViewIfNeeded();
      await this.page.evaluate(() => window.scrollBy(0, -100));

      const blockerBeforeRetry = await this.describeBlocker(btnToClick);
      if (blockerBeforeRetry) {
        console.log(`[blocker] Element covering Submit Decision button: ${blockerBeforeRetry}`);
      }

      await btnToClick.click({ timeout: 5000 });
      opened = await this.drawer
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => true)
        .catch(() => false);
    }

    if (!opened) {
      const blocker = await this.describeBlocker(btnToClick);
      throw new Error(
        'Decision drawer (#activity-verdict-drawer) did not open after Submit Decision. ' +
        'Sticky toolbar may still be intercepting, or the Activity page script failed to load.' +
        (blocker ? ` Element covering the button at failure time: ${blocker}` : '')
      );
    }
  }

  async submitDecision(decisionName?: string, opts?: { preSelected?: boolean }) {
    // Both General Review and Fee use #ActivityVerdictButton at the top to open the drawer.
    // The drawer does NOT auto-open — an explicit click is always needed.
    await this.openDecisionDrawer();

    // Wait for the decision options to load and render inside the drawer body
    await this.decisionBody.locator('input[name="VerdictOutcome"], .js-decision-option, label, button, .card')
      .first()
      .waitFor({ state: 'attached', timeout: 15000 })
      .catch(() => { console.log('Warning: Decision options did not render within 15s.'); });

    // If the drawer still shows uncleared-section blockers, close it, clear again, and reopen once.
    // Issuance can show "Mark All Sections Reviewed" even when auto-criteria (e.g. Report missing)
    // cannot be cleared from this page — in that case we fall through to an enabled option (Pause).
    const blockerAlert = this.drawer.locator('.alert, [role="alert"]').filter({ hasText: /blocker|not yet cleared/i }).first();
    if (await blockerAlert.isVisible({ timeout: 2000 }).catch(() => false)) {
      const msg = (await blockerAlert.textContent().catch(() => ''))?.trim() || 'sections not yet cleared';
      console.log(`Drawer shows blockers (${msg}). Closing, re-clearing sections, and reopening...`);
      await this.drawer.locator('.btn-close').first().click();
      await this.drawer.waitFor({ state: 'hidden', timeout: 15000 });

      await new GeneralReviewComponent(this.page).markAllCleared();
      await this.openDecisionDrawer();
    }

    let clicked = false;
    if (decisionName) {
      const decisionLabel = this.decisionBody.getByText(new RegExp(decisionName, 'i')).first();
      if (await decisionLabel.isVisible({ timeout: 5000 }).catch(() => false)) {
        await decisionLabel.click();
        clicked = true;
      }
    }

    // If the caller explicitly pre-selected a radio via data-decision (e.g. revision / rejection /
    // conditional flows), honour that selection — skip the fee and approve fallbacks entirely.
    //
    // IMPORTANT: do NOT infer this from input[name="VerdictOutcome"]:checked — the server
    // always pre-checks the first enabled option (ActivityVerdictDrawer.cshtml:65), so
    // :checked is truthy on every render, and the implicit check would skip the fee-waive
    // and positive-outcome fallbacks for every caller that passes no decisionName.
    if (!clicked && opts?.preSelected) {
      await expect(
        this.drawer.locator('input[name="VerdictOutcome"]:checked')
      ).toHaveCount(1, { timeout: 5000 });
      console.log('Radio pre-selected by caller — skipping selection fallback and submitting as-is.');
      clicked = true;
    }

    // Fee steps: prefer "Waive fee" over "Payment confirmed" so automation does not depend
    // on a real citizen payment having been completed (activity is often ON HOLD / awaiting payment).
    if (!clicked) {
      const waiveFee = this.decisionBody.locator('.js-decision-option').filter({ hasText: /Waive fee/i }).first();
      if (await waiveFee.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('Fee step detected — selecting "Waive fee"...');
        await waiveFee.click();
        clicked = true;
      }
    }

    // Prefer enabled positive outcomes; skip locked radios (e.g. Issue certificate while sections blocked).
    if (!clicked) {
      const fallbackRegex = /Accept & route|Accept|Approve and Route|Approved|Approve|Issue certificate|Payment confirmed|Issue|Package|Generate|Complete|Done|Send|Clear|Review complete|Verify|Validate|Proceed|Pass|Passed/i;
      const enabledOptions = this.decisionBody.locator('.js-decision-option').filter({
        has: this.page.locator('input[name="VerdictOutcome"]:not([disabled])'),
      });
      const preferred = enabledOptions.filter({ hasText: fallbackRegex }).first();
      if (await preferred.isVisible({ timeout: 5000 }).catch(() => false)) {
        await preferred.click();
        clicked = true;
      } else if (await enabledOptions.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        const label = (await enabledOptions.first().textContent().catch(() => ''))?.trim().slice(0, 60);
        console.log(`Positive decision locked — selecting enabled option: ${label || '(unknown)'}`);
        await enabledOptions.first().click();
        clicked = true;
      }
    }

    if (!clicked) {
      throw new Error('No enabled decisions available in the drawer.');
    }

    // Ensure a radio is actually selected before confirming/submitting.
    await this.drawer.locator('input[name="VerdictOutcome"]:checked')
      .waitFor({ state: 'attached', timeout: 5000 })
      .catch(() => {
        throw new Error('A verdict option was clicked but no VerdictOutcome radio is checked.');
      });

    // Pause / On Hold requires a reason when that group is shown.
    const onHoldReason = this.drawer.locator('#Input_OnHoldReason');
    if (await onHoldReason.isVisible({ timeout: 1500 }).catch(() => false)) {
      const existing = await onHoldReason.inputValue().catch(() => '');
      if (!existing?.trim()) {
        await onHoldReason.fill('Automation: pausing until blockers / missing artifacts are resolved');
      }
    }

    // Fee / issuance options often require the explicit confirm checkbox (#Input_Confirm).
    const confirmCheckbox = this.drawer.locator('#Input_Confirm');
    if (await confirmCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      if (!await confirmCheckbox.isChecked().catch(() => false)) {
        // NOTE: force kept — likely a native checkbox hidden behind custom styling, same
        // reasoning as the checkbox cases in general-review.component.ts / citizen.steps.ts.
        await confirmCheckbox.check({ force: true });
      }
    } else {
      const confirmLabel = this.drawer.getByText(/I confirm this action/i).first();
      if (await confirmLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmLabel.click();
      }
    }

    const finalSubmitButton = this.drawer.locator('#SubmitVerdictButton');
    await finalSubmitButton.waitFor({ state: 'visible', timeout: 20000 });
    await expect(finalSubmitButton).toBeEnabled({ timeout: 20000 });

    console.log('Clicking final Submit Decision in the verdict drawer...');

    // FIX: The screenshots show that after this click, the *submit-decision* XHR itself
    // finishes quickly (~2.6s), but the page then sits on a page-level "Opening service
    // request — loading details..." spinner while a `Detail?id=...` request stays pending
    // for 30+ seconds (likely driven by rendering a large, e.g. 152-page, merged document).
    // Waiting on that request explicitly — instead of a blind click + waitForLoaders() —
    // means we wait exactly as long as the server actually takes, and we log the real
    // duration instead of it being an invisible, unexplained delay.
    const t0 = Date.now();
    await this.waitForNetworkResponse(
      /\/Detail(\?|$)/i,
      async () => {
        // FIX: removed default force — this button was just explicitly confirmed visible AND
        // enabled two lines above, and our own trace analysis earlier in this investigation
        // proved this exact click resolves in under 100ms without needing force at all. There
        // was no documented reason for it here, unlike the sticky-toolbar button in
        // openDecisionDrawer() above, which keeps force with an explanatory comment.
        await finalSubmitButton.click({ timeout: 30000 });
      },
      60000
    ).catch((e) => {
      console.log(`Warning: Detail request wait failed/timed out: ${e.message}. Falling back to URL wait.`);
    });
    console.log(`[timing] Total time from Submit click to Detail response: ${Date.now() - t0}ms`);

    // Successful submit closes the drawer and redirects to SR Detail via OffcanvasManager.onResult.
    // Sticky overlays / silent canCommit=false can leave the drawer open — retry with a real click.
    const leftActivity = await this.page
      .waitForURL((url) => !url.href.includes('Activity'), { timeout: 15000, waitUntil: 'domcontentloaded' })
      .then(() => true)
      .catch(() => false);

    if (!leftActivity && await this.drawer.isVisible({ timeout: 2000 }).catch(() => false)) {
      // FIX: previously retried via `$(btn).trigger('click')` — same synthetic-event bypass
      // problem as openDecisionDrawer() above. Retry with a real click; report what's covering
      // the button if anything is, and fall through to the existing detail-URL fallback below
      // if the drawer genuinely won't submit rather than forcing past a real interception.
      console.log('Still on Activity with drawer open after Submit — retrying with a real click...');
      const blocker = await this.describeBlocker(finalSubmitButton);
      if (blocker) {
        console.log(`[blocker] Element covering Submit Decision button: ${blocker}`);
      }
      await finalSubmitButton.click({ timeout: 5000 });

      await this.page
        .waitForURL((url) => !url.href.includes('Activity'), { timeout: 60000, waitUntil: 'domcontentloaded' })
        .catch(async () => {
          // Last resort: navigate to the shell's detail URL if the server accepted the decision
          // but the client redirect did not fire.
          const detailUrl = await this.page.locator('.ta-activity-shell').getAttribute('data-detail-url');
          if (detailUrl) {
            console.log(`Client redirect missing — navigating to detail URL: ${detailUrl}`);
            await this.page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
          } else {
            throw new Error('Submit Decision did not redirect away from the Activity page.');
          }
        });
    }

    await this.waitForLoaders();
  }
}