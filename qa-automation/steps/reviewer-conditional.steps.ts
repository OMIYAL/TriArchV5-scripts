import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { ActivityRevisionPage } from '../pages/control-room/activity-revision.page';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';

const { When, Then } = createBdd();

/**
 * Conditional approval scenario — unique steps only.
 *
 * Login / navigation / redirect steps are already registered in reviewer.steps.ts
 * and reused from the feature file without re-declaration here.
 *
 * All activity-processing logic lives in ActivityRevisionPage:
 *   selectAndTriggerConditional → selectActiveRequest (skips SRs with no pending doc step)
 *     → processAllWithConditionalDocStep:
 *   Phase 1 (processUntilFirstDocumentStep):
 *     · Non-document steps → approved normally (generalReview + packaging + submitDecision)
 *     · First Document Review step → Conditional selected from #DecisionOptions via
 *       data-decision attribute, notes filled, submitDecision({preSelected:true}) called,
 *       then loop halts.
 *   Phase 2 (processActivities):
 *     · All remaining steps approved normally until no more open activities.
 */

When('the Reviewer selects a Service Request and triggers the Conditional decision on the Document Review step', async ({ page }) => {
  const myRequestsPage = new MyRequestsPage(page);
  const activityRevisionPage = new ActivityRevisionPage(page);
  // This scanner guarantees we only process an SR that actually has a pending Document Review step.
  await activityRevisionPage.selectAndTriggerConditional(myRequestsPage);
});

/**
 * FIX (Finding 3): this step was previously a documented no-op that ignored both
 * parameters — the Gherkin read as if it selected the decision, but nothing did, and
 * the scenario's only other assertion (`status should be "Closed"`) can't distinguish
 * a Conditional approval from a plain Approve, since both end in Closed.
 *
 * The actual decision selection already happens inside processAllWithConditionalDocStep()
 * (via the hard data-decision + toBeChecked() assertions in activity-revision.page.ts).
 * This step now asserts the real, observable outcome instead: confirmed via DevTools,
 * the decision type renders as text inside `.ta-status` (e.g. `ta-status--approved`
 * containing "Conditional") within the activity's `.ta-activity-lane`. Scoping to the
 * lane matching the named activity keeps this correct even if other steps in the same
 * SR were also approved.
 */
Then(
  'the Reviewer selects the {string} option for the {string} activity only',
  async ({ page }, decision: string, activity: string) => {
    const lane = page.locator('.ta-activity-lane').filter({ hasText: new RegExp(activity, 'i') }).first();
    await expect(lane.locator('.ta-status')).toHaveText(new RegExp(decision, 'i'), { timeout: 15000 });
  },
);

/**
 * Asserts the SR status badge text (e.g. "Closed").
 */
Then(
  'the status of the service request should be {string}',
  async ({ page }, expectedStatus: string) => {
    await page.waitForLoadState('domcontentloaded');
    const regex = new RegExp(expectedStatus, 'i');

    // Control Room: state machine subtitle (e.g. "Correction required", "Under Review", "Closed")
    const controlRoomStatus = page.locator('.ta-state-machine__subtitle strong');
    const isControlRoom = await controlRoomStatus.isVisible({ timeout: 3000 }).catch(() => false);

    if (isControlRoom) {
      await expect(controlRoomStatus).toHaveText(regex, { timeout: 30000 });
      return;
    }

    // Storefront: the SR detail page shows "REQUEST STATUS • <status text>" inside a badge/span.
    // The actual badge has the class .ta-status (e.g., <span class="ta-status ta-status--review">Under Review</span>).
    const storefrontStatus = page.locator('.ta-status');
    await expect(storefrontStatus).toHaveText(regex, { timeout: 30000 });
  },
);