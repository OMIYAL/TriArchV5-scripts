import { createBdd } from 'playwright-bdd';
import { Page } from '@playwright/test';
import { getScenarioState } from '../utils/scenario-state';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';
import { PortalSRDetailPage } from '../pages/control-room/portal-sr-detail.page';
import { ActivityReviewPage } from '../pages/control-room/activity-review.page';
import { loginToPortal } from '../utils/auth.helper';

const { Given, When, Then } = createBdd();

// ─── Coordinator Steps ────────────────────────────────────────────────────────

When('the Coordinator opens the newly created Service Request', async ({ page }) => {
  const state = getScenarioState(page);
  if (!state.trackingNumber) {
    throw new Error('No tracking number found in state. Ensure Citizen steps ran successfully.');
  }
  const myRequestsPage = new MyRequestsPage(page);
  await myRequestsPage.navigateToRequestByTrackingNumber(state.trackingNumber);
});

Then('the Coordinator randomly assigns activity steps to reviewers', async ({ page }) => {
  const detailPage = new PortalSRDetailPage(page);
  const pendingCount = await detailPage.getPendingStepCount();
  const state = getScenarioState(page);
  
  if (pendingCount === 0) {
    console.log('No pending steps to assign.');
    state.assignedReviewers = [];
    return;
  }

  // Remove Math.random() non-deterministic branching
  // Always split reviewers if possible to test multi-reviewer paths, otherwise use single
  const reviewer1 = process.env.REVIEWER1_USERNAME || 'Reviewer1';
  const reviewer2 = process.env.REVIEWER2_USERNAME || 'Reviewer2';

  if (pendingCount <= 3) {
    console.log(`E2E Workflow (Same Reviewer): Assigning all ${pendingCount} step(s) to ${reviewer2}`);
    await detailPage.assignReviewerToSteps(reviewer2); // Assigns all
    state.assignedReviewers = [reviewer2];
  } else {
    // Split: first 3 steps to reviewer 1, remaining to reviewer 2
    const stepsForReviewer1 = 3;
    const stepsForReviewer2 = pendingCount - stepsForReviewer1;

    if (stepsForReviewer2 <= 0) {
      // No steps left for reviewer 2 after assigning to reviewer 1 — use single-reviewer path.
      console.log(`E2E Workflow (Same Reviewer — no steps remain for ${reviewer2}): Assigning all ${pendingCount} step(s) to ${reviewer1}`);
      await detailPage.assignReviewerToSteps(reviewer1); // Assigns all
      state.assignedReviewers = [reviewer1];
    } else {
      console.log(`E2E Workflow (Different Reviewers): Assigning first ${stepsForReviewer1} steps to ${reviewer1}, remaining ${stepsForReviewer2} to ${reviewer2}`);
      await detailPage.assignReviewerToSteps(reviewer1, stepsForReviewer1);

      // Re-count remaining after reviewer 1's assignment to guard against the SR
      // rendering fewer buttons than expected (e.g. sequential-unlock workflows).
      const remainingCount = await detailPage.getPendingStepCount();
      if (remainingCount === 0) {
        console.log(`  ℹ️ No steps remain after assigning ${stepsForReviewer1} to ${reviewer1} — skipping ${reviewer2}.`);
        state.assignedReviewers = [reviewer1];
      } else {
        console.log(`  📋 ${remainingCount} step(s) remain — assigning to ${reviewer2}.`);
        await detailPage.assignReviewerToSteps(reviewer2); // Assigns all remaining
        state.assignedReviewers = [reviewer1, reviewer2];
      }
    }
  }
});

// ─── Reviewer Steps ───────────────────────────────────────────────────────────

Then('the assigned Reviewers sequentially process all active activities', async ({ page }) => {
  const state = getScenarioState(page);
  if (state.assignedReviewers.length === 0) {
    console.log('No reviewers were assigned in the previous step. Skipping reviewer processing.');
    return;
  }

  for (const username of state.assignedReviewers) {
    console.log(`\n=== Processing activities for Reviewer: ${username} ===`);
    
    // Resolve password based on username
    let password = process.env.REVIEWER_PASSWORD || '';
    if (username === process.env.REVIEWER1_USERNAME) {
      password = process.env.REVIEWER1_PASSWORD || '';
    } else if (username === process.env.REVIEWER2_USERNAME) {
      password = process.env.REVIEWER2_PASSWORD || '';
    }

    // 1. Log in as this specific reviewer
    await loginToPortal(page, username, password);

    // 2. Open the specific SR
    const myRequestsPage = new MyRequestsPage(page);
    await myRequestsPage.navigateToRequestByTrackingNumber(state.trackingNumber);

    // 3. Process activities assigned to them
    const activityReviewPage = new ActivityReviewPage(page);
    await activityReviewPage.processActivities(myRequestsPage);
    
    console.log(`=== Finished processing for Reviewer: ${username} ===\n`);
  }
});
