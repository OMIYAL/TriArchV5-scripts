import { Page, expect } from '@playwright/test';
import { ActivityReviewPage } from './activity-review.page';
import { MyRequestsPage } from '../storefront/my-requests.page';
import { faker } from '@faker-js/faker';
import { waitForTableData, waitForFilteredTableData } from '../../utils/table.helper';
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
        // 1. Open verdict drawer if not already open.
        const drawer = this.page.locator('#activity-verdict-drawer');
        const verdictBtn = this.page.locator('#ActivityVerdictButton');
        if (await verdictBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await verdictBtn.click();
          await drawer.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { });
        }

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
        await this.submitDecision();
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

        // 1. Open verdict drawer explicitly — same pattern as revision flow.
        //    submitDecision's generic getByText fallback can silently approve
        //    when 'Reject' text isn't matched, so we pre-select here instead.
        const drawer = this.page.locator('#activity-verdict-drawer');
        const verdictBtn = this.page.locator('#ActivityVerdictButton');
        if (await verdictBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await verdictBtn.click();
          await drawer.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { });
        }

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
        await this.submitDecision();
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
   * @param continueAfterDocStep
   *   false (default) — return true immediately after the doc step (revision / rejection).
   *   true            — continue processing remaining steps after the doc step (conditional).
   */
  private async processUntilFirstDocumentStep(
    myRequestsPage: MyRequestsPage,
    maxSteps: number,
    onDocumentStep: () => Promise<void>,
    continueAfterDocStep = false,
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

            if (!continueAfterDocStep) {
              // Halt — revision / rejection: stop after the first doc step.
              return true;
            }
            // Continue — conditional: fall through to the outer loop for remaining steps.
            success = true;
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

  // ─── Conditional flow ────────────────────────────────────────────────────────

  /**
   * Scans UNDER REVIEW SRs and for each one that has an actionable Document
   * Review step, processes all steps, applying a Conditional decision on the Document Review step.
   */
  async selectAndTriggerConditional(myRequestsPage: MyRequestsPage): Promise<void> {
    await myRequestsPage.selectActiveRequest(true, false, async () => {
      const docReviewStatus = await this.getDocumentReviewStatus();
      if (docReviewStatus === 'not-found' || docReviewStatus === 'done') {
        return false; // Skip this SR, it doesn't have a pending doc step
      }
      
      // Found a valid SR. Process it.
      await this.processAllWithConditionalDocStep(myRequestsPage);
      return true; // We successfully processed it, stop scanning
    });
  }

  /**
   * Processes ALL active activity steps for the current SR, applying a Conditional
   * decision specifically on the Document Review step.
   *
   * Two-phase approach (mirrors reviewer.steps.ts processActivities):
   *  Phase 1 — processUntilFirstDocumentStep (continueAfterDocStep=false):
   *    · Non-doc steps before the doc step are approved normally.
   *    · The first Document Review step is conditionally approved, then the loop halts.
   *  Phase 2 — processActivities (inherited from ActivityReviewPage):
   *    · All remaining steps after the conditional approval are processed with the same
   *      proven logic used in reviewer.steps.ts (Waive fee, packaging, issuance, etc.).
   */
  async processAllWithConditionalDocStep(
    myRequestsPage: MyRequestsPage,
    maxSteps = 15,
  ): Promise<void> {
    // Phase 1: process steps up to and including the Document Review conditional approval.
    await this.processUntilFirstDocumentStep(
      myRequestsPage,
      maxSteps,
      async () => {
        console.log('Document review step detected. Triggering Conditional Approval flow...');

        // 1. Open verdict drawer explicitly — same proven pattern as revision/rejection.
        const drawer = this.page.locator('#activity-verdict-drawer');
        const verdictBtn = this.page.locator('#ActivityVerdictButton');
        if (await verdictBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await verdictBtn.click();
          await drawer.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { });
        }

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

        // 4. Submit — drawer already open, Conditional option already checked via data-decision.
        //    Same reasoning as revision/rejection: pass NO decisionName so submitDecision()
        //    does not try to re-select by label text and accidentally deselect the pre-checked radio.
        await this.submitDecision();
        console.log('Document review step conditionally approved. Handing off to processActivities...');
      },
      // continueAfterDocStep=false: halt the loop after conditional approval.
      // Phase 2 (processActivities) takes over for all remaining steps.
    );

    // Phase 2: process all remaining steps using the same reviewer workflow logic.
    // processActivities handles fee waiver, issuance, packaging — identical to reviewer.steps.ts.
    await this.processActivities(myRequestsPage, maxSteps);
  }
}