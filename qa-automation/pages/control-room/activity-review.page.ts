import { Page } from '@playwright/test';
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

  // --- Decision Drawer 
  async submitDecision(decisionName?: string) { await this.decisionDrawer.submitDecision(decisionName); }

  // --- General Review & Fee Checklist 

  async markAllCleared() { await this.generalReview.markAllCleared(); }
  async completeGeneralReview() { await this.generalReview.completeGeneralReview(); }

  // --- Packaging ---

  async completePackaging() { await this.packaging.completePackaging(); }

  /**
   * Returns true if the current activity page has a document/plan viewer.
   * Uses a short timeout so non-doc steps skip immediately without long waits.
   */
  private async isDocumentStep(): Promise<boolean> {
    const viewer = this.page.locator(
      '#ta-doc-review-viewer, #ta-plan-review-viewer, .ta-plan-review-surface__stage'
    ).first();
    return viewer.isVisible({ timeout: 4000 }).catch(() => false);
  }

  /**
   * Processes active activity steps for the current SR.
   * @param myRequestsPage - used to open each activity
   * @param maxSteps - max steps to process before stopping (default: unlimited)
   */
  async processActivities(myRequestsPage: MyRequestsPage, maxSteps = 10): Promise<void> {
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
        } catch (e) {
          retries++;
          if (retries >= 2) throw e;
          console.log(`Activity failed: ${e.message}. Retrying...`);
          const closeBtn = this.page.locator('#activity-verdict-drawer .btn-close').first();
          if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click().catch(() => { });
          await this.page.goBack();
          await this.page.waitForLoadState('domcontentloaded');
          await myRequestsPage.openNextActiveActivity();
        }
      }

      stepsProcessed++;
      console.log(`Waiting for redirect after step ${stepsProcessed}...`);
      await this.page.waitForURL((url) => !url.href.includes('Activity'), { timeout: 90000 });
      await this.page.waitForLoadState('networkidle');
    }
  }
}
