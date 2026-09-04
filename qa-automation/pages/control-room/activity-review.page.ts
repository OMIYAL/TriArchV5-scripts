import { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { OffcanvasDecisionComponent } from './components/offcanvas-decision.component';
import { DocumentViewerComponent } from './components/document-viewer.component';
import { GeneralReviewComponent } from './components/general-review.component';
import { PackagingComponent } from './components/packaging.component';
import { MyRequestsPage } from '../storefront/my-requests.page';

export class ActivityReviewPage extends BasePage {
  private readonly decisionDrawer: OffcanvasDecisionComponent;
  private readonly documentViewer: DocumentViewerComponent;
  private readonly generalReview: GeneralReviewComponent;
  private readonly packaging: PackagingComponent;

  constructor(page: Page) {
    super(page);
    this.decisionDrawer = new OffcanvasDecisionComponent(page);
    this.documentViewer = new DocumentViewerComponent(page);
    this.generalReview = new GeneralReviewComponent(page);
    this.packaging = new PackagingComponent(page);
  }

  // --- Document Viewer 

  async annotateAndComment() { await this.documentViewer.annotateAndComment(); }
  async clickSaveAndNext() { await this.documentViewer.clickSaveAndNext(); }
  async reviewReport() { await this.documentViewer.reviewReport(); }
  async applyApprovedStamp() { await this.documentViewer.applyApprovedStamp(); }
  async switchToRevisedDocument() { return this.documentViewer.switchToRevisedDocument(); }

  // --- Decision Drawer 
  async submitDecision(decisionName?: string, opts?: { preSelected?: boolean; verifyLocator?: Locator }) { await this.decisionDrawer.submitDecision(decisionName, opts); }

  /**
   * Opens #activity-verdict-drawer via the shared, guarded implementation (alreadyOpen
   * check, fallback-button search, jQuery click-handler wait, sticky-toolbar retry).
   * Exposed to subclasses that need the drawer open BEFORE calling submitDecision() —
   * e.g. to pre-select a specific radio (revision / rejection / RAI / conditional flows)
   * — so they don't need a second, independent open-sequence implementation.
   */
  protected async openVerdictDrawer(): Promise<void> {
    await this.decisionDrawer.openDecisionDrawer();
  }

  // --- General Review & Fee Checklist 

  async markAllCleared() { await this.generalReview.markAllCleared(); }
  async completeGeneralReview() { await this.generalReview.completeGeneralReview(); }

  // --- Packaging ---

  async completePackaging() { await this.packaging.completePackaging(); }

  /**
   * Returns true if the current activity page has a document/plan viewer.
   * Uses a short timeout so non-doc steps skip immediately without long waits.
   */
  protected async isDocumentStep(): Promise<boolean> {
    const viewer = this.page.locator(
      '#ta-doc-review-viewer, #ta-plan-review-viewer, .ta-plan-review-surface__stage'
    ).first();
    return viewer.isVisible({ timeout: 4000 }).catch(() => false);
  }

  /**
   * Processes active activity steps for the current SR.
   * @param myRequestsPage - used to open each activity
   * @param maxSteps - max steps to process before stopping (default: unlimited)
   * @param opts.switchToRevisedDocument - opt-in for correction/revision flows only. After a
   *   citizen resubmits, reopening a document step lands on the ORIGINAL submittal (already
   *   reviewed in round 1), so the wizard opens on Verify and the revised PDF is never seen.
   *   When true, each document step first switches review to the most recent resubmitted
   *   document via the Submittal documents panel. Off by default so plain reviewer runs
   *   (reviewer-workflow.feature) are unaffected.
   */
  async processActivities(
    myRequestsPage: MyRequestsPage,
    maxSteps = 10,
    opts: { switchToRevisedDocument?: boolean } = {},
  ): Promise<void> {
    let stepsProcessed = 0;

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
          // Only run the 3-stage document review sequence when a viewer is present.
          // Skipping this for General Review / Fee / Certificate / Packaging steps
          // avoids 3 × 15s getSaveAndNextButton() timeouts on each non-doc activity.
          if (await this.isDocumentStep()) {
            // Correction flows only — see the opts docs above. Must run BEFORE the pipeline,
            // because it is what puts the wizard back on the Review tab.
            if (opts.switchToRevisedDocument) {
              await this.switchToRevisedDocument();
            }
            await this.annotateAndComment();
            await this.clickSaveAndNext();
            await this.reviewReport();
            await this.clickSaveAndNext();
            await this.applyApprovedStamp();
            await this.clickSaveAndNext();
          }

          await this.completeGeneralReview(); // handles "Mark All Sections Reviewed" for all steps that need it
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
          const reopened = await myRequestsPage
            .openNextActiveActivity({ fastFail: true })
            .catch((navErr: any) => {
              console.log(`Recovery navigation failed: ${navErr.message}`);
              return false;
            });
          if (!reopened) throw e; // preserve the original failure
        }
      }

      stepsProcessed++;
      console.log(`Waiting for redirect after step ${stepsProcessed}...`);
      const redirected = await this.page
        .waitForURL((url) => !url.href.includes('Activity'), { timeout: 30000, waitUntil: 'domcontentloaded' })
        .then(() => true)
        .catch(() => false);

      if (!redirected && this.page.url().includes('Activity')) {
        const detailUrl = await this.page.locator('.ta-activity-shell').getAttribute('data-detail-url');
        if (detailUrl) {
          console.log(`Redirect stalled — navigating to detail URL: ${detailUrl}`);
          await this.page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
        } else {
          throw new Error(`Still on Activity page after step ${stepsProcessed}; decision may not have submitted.`);
        }
      }
      await this.waitForLoaders();
    }
  }

  /**
   * Returns true when the portal SR detail page STATE MACHINE header shows "Pending Payment".
   * This signals that an activity fee step has become open and is awaiting citizen payment
   * before the reviewer can continue.
   *
   * Detection relies on the `.ta-state-machine__subtitle strong` selector, which is the same
   * element verified in PortalSRDetailPage.verifyUnderReview() — confirmed from live DOM.
   */
  private async isPendingPaymentState(): Promise<boolean> {
    const stateMachineText = await this.page
      .locator('.ta-state-machine__subtitle strong')
      .textContent({ timeout: 3000 })
      .catch(() => '');
    const isPending = stateMachineText?.trim() === 'Pending Payment';
    if (isPending) {
      console.log('  💳 STATE MACHINE: Pending Payment detected — payment step intercept triggered.');
    }
    return isPending;
  }

  /**
   * Processes active activity steps for the current SR, with a payment intercept hook.
   *
   * Behaviour:
   * - At the start of each loop iteration (before opening the next activity), checks if
   *   the STATE MACHINE shows "Pending Payment".
   * - If a payment state is detected the reviewer does NOT open the fee step. Instead,
   *   citizenPayFn is called — it switches to the citizen storefront, pays the outstanding
   *   activity fee, then logs back in as the reviewer and navigates back to the SR.
   * - After citizenPayFn returns, the loop reloads the SR detail page and continues —
   *   the fee step will now show "Approved" and any remaining activities can be processed.
   * - All other steps (document review, general review, packaging) follow the same path
   *   as processActivities().
   *
   * @param myRequestsPage - used to open each activity
   * @param citizenPayFn   - async callback that handles citizen payment + reviewer re-login
   * @param maxSteps       - safety ceiling on steps processed (default: 10)
   */
  async processActivitiesWithPaymentIntercept(
    myRequestsPage: MyRequestsPage,
    citizenPayFn: () => Promise<void>,
    maxSteps = 10,
  ): Promise<void> {
    let stepsProcessed = 0;
    let paymentHandled = false; // guard: only intercept once per SR

    while (stepsProcessed < maxSteps) {
      // ── Payment intercept check ──────────────────────────────────────────
      // Run BEFORE opening the next activity. If the STATE MACHINE shows
      // "Pending Payment" and we haven't already handled it this run, hand
      // off to the citizen to pay, then resume.
      if (!paymentHandled && await this.isPendingPaymentState()) {
        console.log('\n=== Payment intercept: calling citizenPayFn ===');
        await citizenPayFn();
        paymentHandled = true;

        // After citizenPayFn the page is back on the portal SR detail (reviewer
        // re-login + navigateToRequestByTrackingNumber handled inside citizenPayFn).
        // Reload to pick up the updated activity statuses before the next iteration.
        await this.page.waitForLoadState('domcontentloaded');
        await this.waitForLoaders();
        console.log('=== Payment intercept complete — resuming reviewer loop ===\n');
        continue; // re-check for more activities
      }

      const hasNext = await myRequestsPage.openNextActiveActivity();
      if (!hasNext) {
        console.log(`No more active activities after ${stepsProcessed} step(s).`);
        break;
      }

      let success = false;
      let retries = 0;
      while (!success && retries < 2) {
        try {
          if (await this.isDocumentStep()) {
            await this.annotateAndComment();
            await this.clickSaveAndNext();
            await this.reviewReport();
            await this.clickSaveAndNext();
            await this.applyApprovedStamp();
            await this.clickSaveAndNext();
          }

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
          const reopened = await myRequestsPage
            .openNextActiveActivity({ fastFail: true })
            .catch((navErr: any) => {
              console.log(`Recovery navigation failed: ${navErr.message}`);
              return false;
            });
          if (!reopened) throw e;
        }
      }

      stepsProcessed++;
      console.log(`Waiting for redirect after step ${stepsProcessed}...`);
      const redirected = await this.page
        .waitForURL((url) => !url.href.includes('Activity'), { timeout: 30000, waitUntil: 'domcontentloaded' })
        .then(() => true)
        .catch(() => false);

      if (!redirected && this.page.url().includes('Activity')) {
        const detailUrl = await this.page.locator('.ta-activity-shell').getAttribute('data-detail-url');
        if (detailUrl) {
          console.log(`Redirect stalled — navigating to detail URL: ${detailUrl}`);
          await this.page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
        } else {
          throw new Error(`Still on Activity page after step ${stepsProcessed}; decision may not have submitted.`);
        }
      }
      await this.waitForLoaders();
    }
  }
}
