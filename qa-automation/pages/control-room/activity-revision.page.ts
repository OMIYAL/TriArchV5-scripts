import { Page, Locator, expect } from '@playwright/test';
import { ActivityReviewPage } from './activity-review.page';
import { MyRequestsPage } from '../storefront/my-requests.page';
import { faker } from '@faker-js/faker';
import { getScenarioState } from '../../utils/scenario-state';

export class ActivityRevisionPage extends ActivityReviewPage {
  constructor(page: Page) {
    super(page);
  }

  // ─── Shared SR-scanning core ──────────────────────────────────────────────

  /**
   * Identifies the actual status of the Document Review lane by reading the
   * app's own `ta-activity-lane--st-{status}` class modifier — the reliable
   * contract (not visible badge text, which is incidental). Real observed
   * values: approved | rejected | active | hold | pending.
   * Returns 'done', 'pending', or 'not-found'.
   */
  private async getDocumentReviewStatus(): Promise<'done' | 'pending' | 'not-found'> {
    const lanes = this.page.locator('.ta-activity-lane');
    const laneCount = await lanes.count().catch(() => 0);
    for (let i = 0; i < laneCount; i++) {
      const lane = lanes.nth(i);
      const typeText = await lane.locator('.ta-actrow__type').first().textContent().catch(() => '');
      if (!/document\s*review/i.test(typeText ?? '')) continue;

      const className = (await lane.getAttribute('class').catch(() => '')) ?? '';
      // BP-2: 'hold' is still actionable (e.g. paused pending clarification) — treat it as
      // pending, not done. Any other modifier (approved, rejected, …) means the step has
      // moved past active/pending/hold and is no longer actionable for our purposes.
      if (/--st-(active|pending|hold)\b/.test(className)) return 'pending';
      return 'done';
    }
    return 'not-found';
  }

  // ─── Shared drawer-open helper ────────────────────────────────────────────

  /**
   * Opens `#activity-verdict-drawer` using the two-phase approach and returns
   * the drawer Locator so callers can immediately select a radio.
   *
   * Two-phase open (required for CI stability):
   *  1. Click `#ActivityVerdictButton` to trigger the Bootstrap open animation.
   *  2. `waitForFunction` on `.show` class — the animation-complete signal.
   *     Using `.show` (not Playwright `isVisible`) prevents callers from
   *     interacting with a still-animating drawer, which causes Bootstrap to
   *     treat the click as an outside-click and dismiss the offcanvas, then
   *     `submitDecision()` reopens it and resets the radio to the server default
   *     (Approve) — the root cause of the original CI wrong-verdict bug.
   *  3. Falls back to `waitFor({state:'visible'})` with a loud warning if `.show`
   *     is not detected within 8 s — slow CI environments still proceed, but the
   *     warning is visible in logs so the flake is never silent.
   *
   * @param context - Short label for warning messages: 'revision' | 'rejection' |
   *                  'rai' | 'conditional'.
   * @returns The `#activity-verdict-drawer` Locator (already open).
   */
  private async openVerdictDrawerForPreSelection(context: string): Promise<Locator> {
    const drawer = this.page.locator('#activity-verdict-drawer');
    const verdictBtn = this.page.locator('#ActivityVerdictButton');
    if (await verdictBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await verdictBtn.click();
      const showReady = await this.page
        .waitForFunction(
          () => !!document.querySelector('#activity-verdict-drawer.show'),
          { timeout: 8000 },
        )
        .then(() => true)
        .catch(() => false);
      if (!showReady) {
        console.warn(
          `[openDrawer/${context}] #activity-verdict-drawer.show not detected within 8s `
          + '— falling back to isVisible. If radio resets, increase timeout or check CI perf.',
        );
        await drawer.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      }
    }
    return drawer;
  }

  // ─── Revision flow ────────────────────────────────────────────────────────

  /**
   * Scans UNDER REVIEW SRs and for each one that has an actionable Document
   * Review step, attempts to trigger a "Needs revision" decision on it.
   *
   * Uses myRequestsPage.selectActiveRequest with a predicate to pre-filter
   * single-reviewer SRs that have a pending Document Review step.
   */
  async selectAndTriggerRevision(myRequestsPage: MyRequestsPage): Promise<void> {
    await myRequestsPage.selectActiveRequest(true, false, async () => {
      const docReviewStatus = await this.getDocumentReviewStatus();
      if (docReviewStatus === 'not-found' || docReviewStatus === 'done') {
        return false;
      }
      return this.processUntilFirstDocumentRevision(myRequestsPage);
    });
  }

  /**
   * Processes active activity steps sequentially.
   * Approves non-document steps normally.
   * Upon encountering the FIRST document review step, marks it for revision and stops.
   *
   * Returns:
   *  true  — a Document Review step was found and marked for revision
   *  false — all active steps were processed without hitting a Document Review step
   *           (caller should try the next SR)
   */
  async processUntilFirstDocumentRevision(myRequestsPage: MyRequestsPage, maxSteps = 10): Promise<boolean> {
    // Save tracking number from current page into scenario state if not already set.
    // BP-1: the body-regex approach assumed a 2-letter jurisdiction code and silently skipped
    // on any format mismatch. The detail page exposes a stable hidden input with the exact
    // value — use that instead.
    const trackingNumber = await this.page
      .locator('#ServiceRequestTrackingNumber')
      .inputValue()
      .catch(() => '');
    if (trackingNumber) {
      const state = getScenarioState(this.page);
      state.trackingNumber = trackingNumber;
      console.log(`Saved scenario tracking number in ActivityRevisionPage: ${trackingNumber}`);
    } else {
      console.log('Warning: #ServiceRequestTrackingNumber not found — tracking number not saved.');
    }

    return this.processUntilFirstDocumentStep(
      myRequestsPage,
      maxSteps,
      async () => {
        // 1. Open verdict drawer — two-phase (click + waitForFunction on .show).
        //    Rationale in openVerdictDrawerForPreSelection().
        const drawer = await this.openVerdictDrawerForPreSelection('revision');

        // 2. Select "Needs revision" via its stable data-decision attribute — NOT label text.
        //    Finding 1: label-text `.isVisible().catch(() => false)` with no `else` meant a
        //    missing/disabled/drifted label silently left the app's own pre-checked default
        //    (Approve) submitted instead, and the test still went green. The hard
        //    toBeChecked() assertion below closes that: if the wrong radio ends up checked,
        //    this fails loudly instead of silently approving.
        const revisionInput = drawer.locator('#DecisionOptions input[name="VerdictOutcome"][data-decision="4"]');
        await expect(revisionInput).toBeEnabled({ timeout: 5000 });
        await revisionInput.check();
        await expect(revisionInput).toBeChecked();

        // 3. Wait for #RevisionNotesGroup to appear.
        //    Finding 6: this group toggles ONLY when the checked option's data-note === 'Revision'
        //    — it's the app's own confirmation that the correct radio is active. Swallowing its
        //    absence as a warning let the wrong-verdict case (Finding 1) through unnoticed; making
        //    it a hard assertion closes that gap for the revision path specifically.
        const revisionNotesGroup = drawer.locator('#RevisionNotesGroup');
        await expect(revisionNotesGroup).toBeVisible({ timeout: 5000 });

        // 4. Fill Revision Notes.
        const notesInput = revisionNotesGroup.locator('textarea, input').first();
        if (await notesInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log('Filling Revision Notes in #RevisionNotesGroup...');
          await notesInput.fill(`Automation Revision Note: ${faker.lorem.sentence()}`);
        }

        // 5. Submit — the "Needs revision" radio is already checked (confirmed by toBeChecked()
        //    above). Calling submitDecision() WITHOUT a decisionName so it does not try to
        //    re-select by label text (which can deselect the pre-checked radio if the text match
        //    lands on a parent element, causing the fallback to silently submit "Approve" instead).
        //    The checked-radio guard at line 206 of submitDecision() still confirms a radio IS
        //    selected before clicking #SubmitVerdictButton.
        await this.submitDecision(undefined, { preSelected: true });
        console.log('First document review step marked for revision. Halting further processing.');
      },
    );
  }

  // ─── Rejection flow ───────────────────────────────────────────────────────

  /**
   * Scans UNDER REVIEW SRs and for each one that has an actionable Document
   * Review step, attempts to trigger a "Reject" decision on it.
   *
   * Uses myRequestsPage.selectActiveRequest with a predicate to pre-filter
   * single-reviewer SRs that have a pending Document Review step.
   */
  async selectAndTriggerRejection(myRequestsPage: MyRequestsPage): Promise<void> {
    await myRequestsPage.selectActiveRequest(true, false, async () => {
      const docReviewStatus = await this.getDocumentReviewStatus();
      if (docReviewStatus === 'not-found' || docReviewStatus === 'done') {
        return false;
      }
      return this.processUntilFirstDocumentRejection(myRequestsPage);
    });
  }

  /**
   * Processes active activity steps sequentially.
   * Approves non-document steps normally.
   * Upon encountering the FIRST document review step, submits a "Reject" decision and stops.
   *
   * Returns:
   *  true  — a Document Review step was found and rejected
   *  false — all active steps were processed without hitting a Document Review step
   *           (caller should try the next SR)
   */
  async processUntilFirstDocumentRejection(myRequestsPage: MyRequestsPage, maxSteps = 10): Promise<boolean> {
    return this.processUntilFirstDocumentStep(
      myRequestsPage,
      maxSteps,
      async () => {
        console.log('Document review step detected. Triggering Rejection flow...');

        // 1. Open verdict drawer — two-phase (click + waitForFunction on .show).
        //    Rationale in openVerdictDrawerForPreSelection().
        const drawer = await this.openVerdictDrawerForPreSelection('rejection');

        // 2. Select 'Reject' via its stable data-decision attribute — NOT label text.
        //    Same Finding 1 reasoning as the revision path above.
        const rejectInput = drawer.locator('#DecisionOptions input[name="VerdictOutcome"][data-decision="2"]');
        await expect(rejectInput).toBeEnabled({ timeout: 5000 });
        await rejectInput.check();
        await expect(rejectInput).toBeChecked();

        // Finding 5: the previous "#RejectionNotesGroup, #RejectNotesGroup" block is deleted.
        // Neither ID exists in the actual drawer markup (only ConditionalNotesGroup,
        // RevisionNotesGroup, OnHoldReasonGroup are real) — Reject requires no notes at all.
        // The old block cost a 3s isVisible timeout every run for coverage that never existed.

        // 3. Submit — drawer is already open and Reject option already selected via data-decision.
        //    Calling submitDecision() WITHOUT a decisionName so it does not try to re-select
        //    by label text (same race as the revision path above). The checked-radio guard
        //    in submitDecision() confirms the radio is still checked before submitting.
        await this.submitDecision(undefined, { preSelected: true });
        console.log('First document review step rejected. Halting further processing.');
      },
    );
  }


  /**
   * Processes active activity steps in sequence.
   * Non-document steps are approved normally (generalReview → packaging → submitDecision).
   * On the FIRST document review step the 3-stage doc flow runs, then `onDocumentStep`
   * is called to perform the scenario-specific decision.
   *
   * Always halts after the doc step — revision, rejection, and conditional all stop here;
   * the conditional flow's Phase 2 is handled by `processActivities` in its caller.
   * The `continueAfterDocStep` parameter has been removed: no current caller uses `true`,
   * and the two-phase design in `processAllWithConditionalDocStep` is clearer and safer.
   */
  private async processUntilFirstDocumentStep(
    myRequestsPage: MyRequestsPage,
    maxSteps: number,
    onDocumentStep: () => Promise<void>,
  ): Promise<boolean> {
    let stepsProcessed = 0;
    let docStepHandled = false;

    while (stepsProcessed < maxSteps) {
      const hasNext = await myRequestsPage.openNextActiveActivity();
      if (!hasNext) {
        console.log(`No more active activities after ${stepsProcessed} step(s).`);
        break;
      }

      let success = false;
      let retries = 0;
      while (!success && retries < 2) {
        try {
          if (await this.isDocumentStep() && !docStepHandled) {
            // Run the 3-stage document review sequence first.
            await this.annotateAndComment();
            await this.clickSaveAndNext();
            await this.reviewReport();
            await this.clickSaveAndNext();
            // Skip applyApprovedStamp — hand control to the caller for the verdict.
            await this.clickSaveAndNext();

            // Delegate verdict decision to the caller (revision / rejection / conditional…).
            await onDocumentStep();
            docStepHandled = true;

            // Always halt after the doc step. Phase 2 is the caller's responsibility.
            return true;
          } else {
            // FIX (Finding 7): previously this branch had no `else` — when
            // continueAfterDocStep was true, execution fell straight through into
            // completeGeneralReview()/completePackaging()/submitDecision() on the SAME
            // step that onDocumentStep() had just submitted a verdict for, double-submitting
            // a decision on one activity. Latent while the only caller used the false
            // default, but reviewer-conditional.steps.ts now uses continueAfterDocStep=true,
            // making this live. The guard ensures non-document processing only runs when
            // we're not on the step we just handled.
            console.log('Non-document step detected. Processing normally...');
            await this.completeGeneralReview();
            await this.completePackaging();
            await this.submitDecision();
            success = true;
          }
        } catch (e: any) {
          retries++;
          if (retries >= 2) throw e;
          console.log(`Activity failed: ${e.message}. Retrying...`);
          const closeBtn = this.page.locator('#activity-verdict-drawer .btn-close').first();
          if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();
          await this.page.goBack();
          await this.page.waitForLoadState('domcontentloaded');
          await myRequestsPage.openNextActiveActivity();
        }
      }

      stepsProcessed++;
      console.log(`Waiting for redirect after step ${stepsProcessed}...`);
      const redirected = await this.page
        .waitForURL((url) => !url.href.includes('Activity'), {
          timeout: 30000,
          waitUntil: 'domcontentloaded',
        })
        .then(() => true)
        .catch(() => false);

      if (!redirected && this.page.url().includes('Activity')) {
        const detailUrl = await this.page.locator('.ta-activity-shell').getAttribute('data-detail-url');
        if (detailUrl) {
          console.log(`Redirect stalled — navigating to detail URL: ${detailUrl}`);
          await this.page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
        } else {
          throw new Error(
            `Still on Activity page after step ${stepsProcessed}; decision may not have submitted.`
          );
        }
      }

      await this.waitForLoaders();
    }

    // Loop ended. Returns true if a doc step was found and handled, false otherwise.
    return docStepHandled;
  }

  // ─── General Review — Return as Incomplete (RAI) flow ────────────────────────

  /**
   * Identifies the status of the General Review lane by reading the
   * ta-activity-lane--st-{status} class modifier — the same contract used
   * by getDocumentReviewStatus() above.
   * Returns 'done', 'pending', or 'not-found'.
   */
  private async getGeneralReviewStatus(): Promise<'done' | 'pending' | 'not-found'> {
    const lanes = this.page.locator('.ta-activity-lane');
    const laneCount = await lanes.count().catch(() => 0);
    for (let i = 0; i < laneCount; i++) {
      const lane = lanes.nth(i);
      const typeText = await lane.locator('.ta-actrow__type').first().textContent().catch(() => '');
      if (!/general\s*review/i.test(typeText ?? '')) continue;
      const className = (await lane.getAttribute('class').catch(() => '')) ?? '';
      if (/--st-(active|pending|hold)\b/.test(className)) return 'pending';
      return 'done';
    }
    return 'not-found';
  }

  /**
   * Reads the activity type of the FIRST active/pending lane on the current SR detail page.
   * Returns the raw type text (e.g. "General review", "Document review") or an empty string.
   *
   * This is the authoritative detection mechanism for the RAI flow. Rather than detecting
   * the step type AFTER navigating into the activity page (where page.title(), heading text,
   * and button presence all proved unreliable), we read the lane type BEFORE navigating —
   * from the SR detail page's lane list, using the exact same .ta-actrow__type selector
   * that getDocumentReviewStatus() already uses successfully.
   */
  private async getNextActiveLaneType(): Promise<string> {
    const lanes = this.page.locator('.ta-activity-lane');
    const count = await lanes.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const lane = lanes.nth(i);
      const className = (await lane.getAttribute('class').catch(() => '')) ?? '';
      if (!/--st-(active|pending|hold)\b/.test(className)) continue;
      const typeText = await lane.locator('.ta-actrow__type').first().textContent().catch(() => '');
      const type = typeText?.trim() ?? '';
      if (type) {
        console.log(`RAI: Next active lane type detected from detail page: "${type}"`);
        return type;
      }
    }
    return '';
  }

  /**
   * Scans UNDER REVIEW SRs and for each one that has an actionable General Review
   * step, triggers a "Return as incomplete" decision on it.
   *
   * Uses myRequestsPage.selectActiveRequest with a predicate to pre-filter
   * single-reviewer SRs that have a pending General Review step.
   */
  async selectAndTriggerReturnAsIncomplete(myRequestsPage: MyRequestsPage): Promise<void> {
    await myRequestsPage.selectActiveRequest(true, false, async () => {
      const generalReviewStatus = await this.getGeneralReviewStatus();
      if (generalReviewStatus === 'not-found' || generalReviewStatus === 'done') {
        return false;
      }
      return this.processUntilFirstGeneralReviewReturnAsIncomplete(myRequestsPage);
    });
  }

  /**
   * Processes active activity steps sequentially.
   * Non-General-Review steps (including Document Review steps) are approved normally.
   * Upon encountering the FIRST General Review step:
   *  1. Clicks "Mark All Sections Reviewed" (required before the verdict drawer is submittable).
   *  2. Opens the verdict drawer (#ActivityVerdictButton).
   *  3. Selects "Return as incomplete" via value="return".
   *  4. Fills #RevisionNotesGroup notes.
   *  5. Submits — puts the SR into "Correction Required" state.
   *
   * Step type detection uses getNextActiveLaneType() — reads the .ta-actrow__type text from
   * the SR detail page BEFORE opening each activity. This is the same mechanism used by
   * getDocumentReviewStatus() and is provably reliable. Post-navigation detection (page.title,
   * heading text, button presence) was attempted and failed for all approaches.
   *
   * Returns:
   *  true  — a General Review step was found and marked as Return as Incomplete
   *  false — all active steps were processed without hitting a General Review step
   */
  async processUntilFirstGeneralReviewReturnAsIncomplete(
    myRequestsPage: MyRequestsPage,
    maxSteps = 10,
  ): Promise<boolean> {
    // Save tracking number into scenario state — needed by Phase 2 (citizen) and Phase 3 (reviewer).
    const trackingNumber = await this.page
      .locator('#ServiceRequestTrackingNumber')
      .inputValue()
      .catch(() => '');
    if (trackingNumber) {
      const state = getScenarioState(this.page);
      state.trackingNumber = trackingNumber;
      console.log(`Saved scenario tracking number in ActivityRevisionPage (RAI): ${trackingNumber}`);
    } else {
      console.log('Warning: #ServiceRequestTrackingNumber not found — tracking number not saved.');
    }

    let stepsProcessed = 0;
    let generalReviewHandled = false;

    while (stepsProcessed < maxSteps) {
      // Read the next active lane type from the detail page BEFORE opening the activity.
      // This is the reliable source of truth — the same .ta-actrow__type data used by
      // getDocumentReviewStatus(). All post-navigation detection approaches failed.
      const nextLaneType = await this.getNextActiveLaneType();
      const isNextGeneralReview = /general\s*review/i.test(nextLaneType);

      const hasNext = await myRequestsPage.openNextActiveActivity();
      if (!hasNext) {
        console.log(`No more active activities after ${stepsProcessed} step(s).`);
        break;
      }

      let success = false;
      let retries = 0;
      while (!success && retries < 2) {
        try {
          if (isNextGeneralReview) {
            console.log('General Review step confirmed (pre-read from detail page). Triggering Return as Incomplete flow...');

            // 1. Mark all sections reviewed first — required before the verdict drawer
            //    allows submission of non-approve decisions on General Review steps.
            await this.completeGeneralReview();

            // 2. Open verdict drawer — two-phase (click + waitForFunction on .show).
            //    Rationale in openVerdictDrawerForPreSelection().
            const drawer = await this.openVerdictDrawerForPreSelection('rai');

            // 3. Select "Return as incomplete" via value="return".
            //    We use value="return" rather than data-decision="4" because data-decision="4"
            //    is also assigned to "Needs revision" on Document Review steps — targeting
            //    by value avoids a cross-step false match and is the stable contract.
            const returnInput = drawer.locator(
              '#DecisionOptions input[name="VerdictOutcome"][value="return"]',
            );
            await expect(returnInput).toBeEnabled({ timeout: 5000 });
            await returnInput.check();
            await expect(returnInput).toBeChecked();

            // 4. Fill Revision Notes in #RevisionNotesGroup — the same notes panel
            //    that appears after selecting this verdict (confirmed via DevTools).
            const revisionNotesGroup = drawer.locator('#RevisionNotesGroup');
            await expect(revisionNotesGroup).toBeVisible({ timeout: 5000 });
            const notesInput = revisionNotesGroup.locator('textarea, input').first();
            if (await notesInput.isVisible({ timeout: 3000 }).catch(() => false)) {
              console.log('Filling Revision Notes for Return as Incomplete...');
              await notesInput.fill(`Automation Return as Incomplete Note: ${faker.lorem.sentence()}`);
            }

            // 5. Submit — radio already pre-selected and confirmed via toBeChecked() above.
            //    submitDecision() with { preSelected: true } honours the pre-checked radio
            //    and skips the fee/approve fallbacks, same as the revision/rejection paths.
            await this.submitDecision(undefined, { preSelected: true });
            console.log('General Review step marked as Return as Incomplete. Halting further processing.');
            generalReviewHandled = true;
            return true; // submitDecision() already handled the redirect; exit immediately.

          } else if (await this.isDocumentStep()) {
            // Document Review step appearing before the General Review step — approve it normally.
            console.log(`Non-General-Review step ("${nextLaneType || 'Document review'}") — processing document review normally.`);
            await this.annotateAndComment();
            await this.clickSaveAndNext();
            await this.reviewReport();
            await this.clickSaveAndNext();
            await this.applyApprovedStamp();
            await this.clickSaveAndNext();
            await this.completeGeneralReview();
            await this.completePackaging();
            await this.submitDecision();
            success = true;

          } else {
            // Any other non-doc, non-General-Review step — approve normally.
            console.log(`Non-General-Review step ("${nextLaneType || 'unknown'}") — processing normally.`);
            await this.completeGeneralReview();
            await this.completePackaging();
            await this.submitDecision();
            success = true;
          }
        } catch (e: any) {
          retries++;
          if (retries >= 2) throw e;
          console.log(`Activity failed: ${e.message}. Retrying...`);
          const closeBtn = this.page.locator('#activity-verdict-drawer .btn-close').first();
          if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();
          await this.page.goBack();
          await this.page.waitForLoadState('domcontentloaded');
        }
      }

      stepsProcessed++;
      console.log(`Waiting for redirect after step ${stepsProcessed}...`);
      const redirected = await this.page
        .waitForURL((url) => !url.href.includes('Activity'), {
          timeout: 30000,
          waitUntil: 'domcontentloaded',
        })
        .then(() => true)
        .catch(() => false);

      if (!redirected && this.page.url().includes('Activity')) {
        const detailUrl = await this.page.locator('.ta-activity-shell').getAttribute('data-detail-url');
        if (detailUrl) {
          console.log(`Redirect stalled — navigating to detail URL: ${detailUrl}`);
          await this.page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
        } else {
          throw new Error(
            `Still on Activity page after step ${stepsProcessed}; decision may not have submitted.`,
          );
        }
      }

      await this.waitForLoaders();
    }

    return generalReviewHandled;
  }

  // ─── Conditional flow ────────────────────────────────────────────────────────

  /**
   * Scans UNDER REVIEW SRs and for each one that has an actionable Document
   * Review step, processes all steps applying a Conditional decision on the Document Review step.
   *
   * The predicate returns false to skip SRs without a pending doc step, and returns
   * phase 1's boolean so the scanner only stops when a doc step was actually handled.
   */
  async selectAndTriggerConditional(myRequestsPage: MyRequestsPage): Promise<void> {
    await myRequestsPage.selectActiveRequest(true, false, async () => {
      const docReviewStatus = await this.getDocumentReviewStatus();
      if (docReviewStatus === 'not-found' || docReviewStatus === 'done') {
        return false; // Skip — no pending doc step here
      }
      return this.processAllWithConditionalDocStep(myRequestsPage);
    });
  }

  /**
   * Processes ALL active activity steps for the current SR, applying a Conditional
   * decision specifically on the Document Review step.
   *
   * Two-phase approach:
   *  Phase 1 — processUntilFirstDocumentStep:
   *    · Non-doc steps before the doc step are approved normally.
   *    · The first Document Review step is conditionally approved, then the loop halts.
   *    · Returns true if a doc step was found and handled, false if the loop exhausted
   *      all steps without hitting a doc step.
   *  Phase 2 — processActivities (inherited from ActivityReviewPage):
   *    · Only runs when Phase 1 returned true (a doc step was actually found).
   *    · Handles all remaining steps: fee waiver, packaging, issuance, etc.
   *
   * Returns true when Phase 1 handled a doc step (safe for the scanner predicate
   * in selectAndTriggerConditional to use as its "stop scanning" signal).
   */
  async processAllWithConditionalDocStep(
    myRequestsPage: MyRequestsPage,
    maxSteps = 15,
  ): Promise<boolean> {
    // Phase 1: process steps up to and including the Document Review conditional approval.
    const docStepHandled = await this.processUntilFirstDocumentStep(
      myRequestsPage,
      maxSteps,
      async () => {
        console.log('Document review step detected. Triggering Conditional Approval flow...');

        // 1. Open verdict drawer — two-phase (click + waitForFunction on .show).
        //    Rationale in openVerdictDrawerForPreSelection().
        const drawer = await this.openVerdictDrawerForPreSelection('conditional');

        // 2. Select 'Conditional' via its stable data-decision attribute — NOT label text.
        //    Same Finding 1 reasoning as the revision/rejection paths above.
        const conditionalInput = drawer.locator('#DecisionOptions input[name="VerdictOutcome"][data-decision="1"]');
        await expect(conditionalInput).toBeEnabled({ timeout: 5000 });
        await conditionalInput.check();
        await expect(conditionalInput).toBeChecked();

        // 3. Fill Conditional Notes if the field appears after selecting Conditional.
        //    The field is required before #SubmitVerdictButton becomes enabled.
        const notesGroup = drawer.locator('#ConditionalNotesGroup').first();
        const notesInput = (await notesGroup.isVisible({ timeout: 3000 }).catch(() => false))
          ? notesGroup.locator('textarea, input').first()
          : drawer.locator('#Input_ConditionalNotes, textarea').first();

        if (await notesInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log('Filling Conditional Notes...');
          await notesInput.fill('Conditional approval — subject to outstanding conditions being met.');
        }

        // 4. Submit — drawer open, Conditional radio pre-checked via data-decision.
        //    Pass { preSelected: true } so submitDecision() honours the pre-checked radio
        //    and does not run the fee/approve fallbacks (which would fire because the server
        //    also pre-checks a different option on every render, making :checked always truthy).
        await this.submitDecision(undefined, { preSelected: true });
        console.log('Document review step conditionally approved. Handing off to processActivities...');
      },
    );

    if (!docStepHandled) {
      console.log('processAllWithConditionalDocStep: no Document Review step found — skipping Phase 2.');
      return false;
    }

    // Phase 2: process all remaining steps using the same reviewer workflow logic.
    // Only reached when Phase 1 confirmed a doc step was found and conditionally approved.
    await this.processActivities(myRequestsPage, maxSteps);
    return true;
  }
}