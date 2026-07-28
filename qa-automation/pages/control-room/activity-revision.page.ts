import { Page } from '@playwright/test';
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
   * contract (not visible badge text, which is incidental).
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
      if (/--st-(active|pending)\b/.test(className)) return 'pending';
      // Any other modifier (--st-approved, --st-rejected, --st-needs-revision, …)
      // means the step has moved past active/pending — no longer actionable.
      return 'done';
    }
    return 'not-found';
  }

  /**
   * Shared SR-scanning engine used by both revision and rejection flows.
   *
   * Iterates UNDER REVIEW SRs, skips multi-reviewer ones and SRs where the
   * Document Review step is missing or already done, then delegates the actual
   * per-step processing to `processFn`.
   *
   * @param processFn  — async callback that processes one SR; returns `true`
   *                     when the target outcome (revision / rejection) was
   *                     successfully triggered, `false` to try the next SR.
   * @param label      — human-readable label used in console logs ("revision" / "rejection").
   * @param maxAttempts
   */
  private async scanAndTrigger(
    processFn: (myRequestsPage: MyRequestsPage) => Promise<boolean>,
    label: string,
    myRequestsPage: MyRequestsPage,
    maxAttempts = 20,
  ): Promise<void> {
    await myRequestsPage.navigateReloadAndScroll();
    const visited = new Set<string>();
    let attempts = 0;

    const trySRs = async (): Promise<boolean> => {
      const rows = this.page.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        if (attempts >= maxAttempts) {
          throw new Error(
            `Gave up after ${maxAttempts} SRs — none successfully triggered a Document Review ${label}.`
          );
        }

        const row = rows.nth(i);
        const text = await row.textContent().catch(() => '');
        if (!text?.includes('UNDER REVIEW')) continue;

        const link = row.getByRole('link').first();
        const href = await link.getAttribute('href').catch(() => null);
        if (!href || visited.has(href) || !(await link.isVisible().catch(() => false))) continue;

        visited.add(href);
        attempts++;

        await link.click();
        await this.page.waitForURL(/ServiceRequests\/(Detail|Activity)/i, {
          timeout: 30000,
          waitUntil: 'domcontentloaded',
        });
        await this.waitForLoaders();

        // Skip multi-reviewer SRs — parallel steps block the active reviewer.
        const chips = this.page.locator('.ta-reviewer-chip');
        await chips.first().waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
        const chipCount = await chips.count().catch(() => 0);
        if (chipCount !== 1) {
          console.log(`  ⏭ Multi-reviewer SR skipped (${href}). Going back...`);
          await this.page.goBack({ waitUntil: 'domcontentloaded' });
          await waitForTableData(this.page);
          continue;
        }

        // Quick pre-filter: check the Document Review step's actual status.
        const docReviewStatus = await this.getDocumentReviewStatus();

        if (docReviewStatus === 'not-found') {
          console.log(`  ⏭ No Document Review step listed in SR (${href}). Going back...`);
          await this.page.goBack({ waitUntil: 'domcontentloaded' });
          await waitForTableData(this.page);
          continue;
        }

        if (docReviewStatus === 'done') {
          console.log(
            `  ⏭ Document Review already completed in SR (${href}) — no point continuing. Going back...`
          );
          await this.page.goBack({ waitUntil: 'domcontentloaded' });
          await waitForTableData(this.page);
          continue;
        }

        // docReviewStatus === 'pending' — still actionable, worth attempting.
        console.log(`  🔄 Attempting ${label} flow in SR (${href})...`);
        const triggered = await processFn(myRequestsPage);

        if (triggered) {
          console.log(`  ✅ Document Review ${label} successfully triggered in SR (${href}).`);
          return true;
        }

        console.log(
          `  ⏭ All steps processed in SR (${href}) without hitting Document Review ` +
          `(step may belong to another reviewer or is already done). Going back...`
        );
        await myRequestsPage.navigateReloadAndScroll();
      }

      return false;
    };

    if (await trySRs()) return;

    // Retry once with the "Under Review" filter pill applied.
    console.log(`No ${label} triggered in default view SRs. Applying "Under Review" filter...`);
    const filterPill = this.page.getByRole('button', { name: 'Under Review', exact: true }).first();
    if (await filterPill.isVisible({ timeout: 5000 }).catch(() => false)) {
      await filterPill.click();
      await waitForFilteredTableData(this.page);
      if (await trySRs()) return;
    }

    throw new Error(
      `No UNDER REVIEW SR found where a Document Review step could be triggered for ${label}.`
    );
  }

  // ─── Revision flow ────────────────────────────────────────────────────────

  /**
   * Scans UNDER REVIEW SRs and for each one that has an actionable Document
   * Review step, attempts to trigger a "Needs revision" decision on it.
   *
   * If an SR is fully processed without hitting a Document Review step
   * (e.g. the step belongs to a different reviewer or is already done),
   * the scanner moves on to the next SR automatically.
   */
  async selectAndTriggerRevision(myRequestsPage: MyRequestsPage, maxAttempts = 20): Promise<void> {
    await this.scanAndTrigger(
      (mrp) => this.processUntilFirstDocumentRevision(mrp),
      'revision',
      myRequestsPage,
      maxAttempts,
    );
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
    const bodyText = await this.page.locator('body').innerText().catch(() => '');
    const trackingMatch = bodyText.match(/([A-Z]{2,4}\d{3}\s*-\s*[A-Z]{2}\s*-\s*\d{4}\s*-\s*\d{5})/);
    if (trackingMatch) {
      const trackingNumber = trackingMatch[1].replace(/\s+/g, '');
      const state = getScenarioState(this.page);
      state.trackingNumber = trackingNumber;
      console.log(`Saved scenario tracking number in ActivityRevisionPage: ${trackingNumber}`);
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
          await drawer.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        }

        // 2. Select "Needs revision" from #DecisionOptions.
        const revisionOption = drawer
          .locator('#DecisionOptions label.js-decision-option, #DecisionOptions label')
          .filter({ hasText: /Needs revision/i })
          .first();
        if (await revisionOption.isVisible({ timeout: 5000 }).catch(() => false)) {
          console.log('Selecting "Needs revision" option from #DecisionOptions...');
          await revisionOption.click();
        }

        // 3. Wait for #RevisionNotesGroup to appear.
        const revisionNotesGroup = drawer.locator('#RevisionNotesGroup');
        await revisionNotesGroup.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
          console.log('Warning: #RevisionNotesGroup was not visible within 5s');
        });

        // 4. Fill Revision Notes.
        const notesInput = revisionNotesGroup.locator('textarea, input').first();
        if (await notesInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log('Filling Revision Notes in #RevisionNotesGroup...');
          await notesInput.fill(`Automation Revision Note: ${faker.lorem.sentence()}`);
        }

        // 5. Submit.
        await this.submitDecision('Needs revision');
        console.log('First document review step marked for revision. Halting further processing.');
      },
    );
  }

  // ─── Rejection flow ───────────────────────────────────────────────────────

  /**
   * Scans UNDER REVIEW SRs and for each one that has an actionable Document
   * Review step, attempts to trigger a "Reject" decision on it.
   *
   * If an SR is fully processed without hitting a Document Review step,
   * the scanner moves on to the next SR automatically.
   */
  async selectAndTriggerRejection(myRequestsPage: MyRequestsPage, maxAttempts = 20): Promise<void> {
    await this.scanAndTrigger(
      (mrp) => this.processUntilFirstDocumentRejection(mrp),
      'rejection',
      myRequestsPage,
      maxAttempts,
    );
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
          await drawer.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        }

        // 2. Select 'Reject' option explicitly from #DecisionOptions.
        const rejectOption = drawer
          .locator('#DecisionOptions label.js-decision-option, #DecisionOptions label')
          .filter({ hasText: /Reject/i })
          .first();
        if (await rejectOption.isVisible({ timeout: 5000 }).catch(() => false)) {
          console.log('Selecting "Reject" option from #DecisionOptions...');
          await rejectOption.click();
        }

        // 3. Fill rejection reason if a notes field appears after selecting Reject.
        const rejectionNotesGroup = drawer.locator('#RejectionNotesGroup, #RejectNotesGroup').first();
        if (await rejectionNotesGroup.isVisible({ timeout: 3000 }).catch(() => false)) {
          const notesInput = rejectionNotesGroup.locator('textarea, input').first();
          if (await notesInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            console.log('Filling Rejection Notes...');
            await notesInput.fill(`Automation Rejection Note: ${faker.lorem.sentence()}`);
          }
        }

        // 4. Submit — drawer is already open and Reject option already selected.
        //    submitDecision will confirm the pre-selected radio and click #SubmitVerdictButton.
        await this.submitDecision('Reject');
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
            // Continue — conditional: fall through so remaining steps are processed.
            success = true;
          }

          console.log('Non-document step detected. Processing normally...');
          await this.completeGeneralReview();
          await this.completePackaging();
          await this.submitDecision();
          success = true;
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
          await drawer.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        }

        // 2. Select 'Conditional' option explicitly from #DecisionOptions.
        const conditionalOption = drawer
          .locator('#DecisionOptions label.js-decision-option, #DecisionOptions label')
          .filter({ hasText: /Conditional/i })
          .first();
        if (await conditionalOption.isVisible({ timeout: 5000 }).catch(() => false)) {
          console.log('Selecting "Conditional" option from #DecisionOptions...');
          await conditionalOption.click();
        }

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

        // 4. Submit — drawer already open, Conditional option already selected.
        //    submitDecision handles the network wait, redirect, and loaders.
        await this.submitDecision('Conditional');
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