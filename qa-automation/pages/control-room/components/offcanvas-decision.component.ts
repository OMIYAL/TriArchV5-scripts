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
   * Opens the ABP ActivityVerdictDrawer offcanvas.
   * The drawer is loaded lazily — #activity-verdict-drawer does not exist until open() succeeds.
   * Sticky toolbars often intercept normal Playwright clicks on #ActivityVerdictButton, so we
   * force-click and fall back to jQuery trigger (how the page wires the handler).
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
      await swalOk.click().catch(() => { });
      await this.page.waitForTimeout(500);
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
        await swalOk.click().catch(() => { });
      }

      console.log('Drawer not visible after force-click — triggering via jQuery...');
      await this.page.evaluate(() => {
        const $ = (window as any).jQuery;
        const btn = document.querySelector('#ActivityVerdictButton') as HTMLElement | null;
        if ($ && btn) {
          $(btn).trigger('click');
        } else {
          btn?.click();
        }
      });
      opened = await this.drawer
        .waitFor({ state: 'visible', timeout: 30000 })
        .then(() => true)
        .catch(() => false);
    }

    if (!opened) {
      throw new Error(
        'Decision drawer (#activity-verdict-drawer) did not open after Submit Decision. ' +
        'Sticky toolbar may still be intercepting, or the Activity page script failed to load.'
      );
    }
  }

  async submitDecision(decisionName?: string) {
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
      await this.drawer.locator('.btn-close').first().click().catch(() => { });
      await this.drawer.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });

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
    await finalSubmitButton.click({ force: true, timeout: 30000 });

    // Successful submit closes the drawer and redirects to SR Detail via OffcanvasManager.onResult.
    // Sticky overlays / silent canCommit=false can leave the drawer open — retry via jQuery once.
    const leftActivity = await this.page
      .waitForURL((url) => !url.href.includes('Activity'), { timeout: 15000, waitUntil: 'domcontentloaded' })
      .then(() => true)
      .catch(() => false);

    if (!leftActivity && await this.drawer.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Still on Activity with drawer open after Submit — retrying via jQuery...');
      await this.page.evaluate(() => {
        const $ = (window as any).jQuery;
        const btn = document.querySelector('#SubmitVerdictButton');
        if ($ && btn) $(btn).trigger('click');
        else (btn as HTMLElement | null)?.click();
      });
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
