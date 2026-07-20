import { createBdd } from 'playwright-bdd';
import { Page } from '@playwright/test';
import { SharedState } from '../utils/shared-state';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';
import { PortalSRDetailPage } from '../pages/control-room/portal-sr-detail.page';
import { ActivityReviewPage } from '../pages/control-room/activity-review.page';
import { AuthLoginPage } from '../pages/auth-login.page';

const { Given, When, Then } = createBdd();

// Helper to log in, clearing cookies to prevent session bleed between actors
async function loginToPortal(page: Page, username: string, password: string): Promise<void> {
  const portalUrl = process.env.PORTAL_BASE_URL || '';
  const tenant = process.env.TENANT_NAME || 'fps';

  await page.context().clearCookies();
  await page.evaluate(() => {
    try { localStorage.clear(); } catch { }
    try { sessionStorage.clear(); } catch { }
  });

  await page.goto(`${portalUrl}?__tenant=${tenant}`);
  const loginLink = page.getByRole('link', { name: /Log in|Sign in/i }).first();
  await loginLink.waitFor({ state: 'visible', timeout: 20000 });
  await loginLink.click();

  await new AuthLoginPage(page).completeLoginFlow(tenant, username, password, /ControlRoom/i);
}

// ─── Coordinator Steps ────────────────────────────────────────────────────────

When('the Coordinator opens the newly created Service Request', async ({ page }) => {
  if (!SharedState.trackingNumber) {
    throw new Error('No tracking number found in SharedState. Ensure Citizen steps ran successfully.');
  }
  const myRequestsPage = new MyRequestsPage(page);
  await myRequestsPage.navigateToRequestByTrackingNumber(SharedState.trackingNumber);
});

Then('the Coordinator randomly assigns activity steps to reviewers', async ({ page }) => {
  const detailPage = new PortalSRDetailPage(page);
  const pendingCount = await detailPage.getPendingStepCount();
  
  if (pendingCount === 0) {
    console.log('No pending steps to assign.');
    SharedState.assignedReviewers = [];
    return;
  }

  // Randomly decide: 'different' (split) or 'same' (single reviewer)
  const strategy = Math.random() < 0.5 ? 'different' : 'same';
  const reviewer1 = process.env.REVIEWER1_USERNAME || 'Reviewer1';
  const reviewer2 = process.env.REVIEWER2_USERNAME || 'Reviewer2';

  if (strategy === 'same' || pendingCount <= 3) {
    console.log(`E2E Workflow (Same Reviewer): Assigning all ${pendingCount} step(s) to ${reviewer2}`);
    await detailPage.assignReviewerToSteps(reviewer2); // Assigns all
    SharedState.assignedReviewers = [reviewer2];
  } else {
    // Split: first 3 steps to reviewer 1, remaining to reviewer 2
    console.log(`E2E Workflow (Different Reviewers): Assigning first 3 steps to ${reviewer1}, remaining to ${reviewer2}`);
    await detailPage.assignReviewerToSteps(reviewer1, 3);
    await detailPage.assignReviewerToSteps(reviewer2); // Assigns all remaining
    SharedState.assignedReviewers = [reviewer1, reviewer2];
  }
});

// ─── Reviewer Steps ───────────────────────────────────────────────────────────

Then('the assigned Reviewers sequentially process all active activities', async ({ page }) => {
  if (SharedState.assignedReviewers.length === 0) {
    console.log('No reviewers were assigned in the previous step. Skipping reviewer processing.');
    return;
  }

  for (const username of SharedState.assignedReviewers) {
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
    await myRequestsPage.navigateToRequestByTrackingNumber(SharedState.trackingNumber);

    // 3. Process activities assigned to them
    const activityReviewPage = new ActivityReviewPage(page);
    await activityReviewPage.processActivities(myRequestsPage);
    
    console.log(`=== Finished processing for Reviewer: ${username} ===\n`);
  }
});
