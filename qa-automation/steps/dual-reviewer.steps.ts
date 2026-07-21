import { createBdd } from 'playwright-bdd';
import { AuthLoginPage } from '../pages/auth-login.page';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';
import { SRDetailPage } from '../pages/sr-detail.page';
import { ActivityReviewPage } from '../pages/control-room/activity-review.page';
import { Page } from '@playwright/test';
import { getScenarioState } from '../utils/scenario-state';
import { loginToPortal } from '../utils/auth.helper';

const { When, Given } = createBdd();

Given('Reviewer 1 logs in with Reviewer 1 credentials', async ({ page }) => {
  await loginToPortal(page, process.env.REVIEWER1_USERNAME || '', process.env.REVIEWER1_PASSWORD || '');
  console.log(`Reviewer 1 logged in as: ${process.env.REVIEWER1_USERNAME}`);
});

When('the Reviewer selects a multi-reviewer Service Request which is UNDER REVIEW', async ({ page }) => {
  const requestsPage = new MyRequestsPage(page);
  // requireMultiReviewer=true: only pick SRs assigned to 2+ reviewers
  await requestsPage.selectActiveRequest(false, true);
});

When('Reviewer 1 processes the first 3 activity steps and captures the tracking number', async ({ page }) => {
  const myRequestsPage = new MyRequestsPage(page);
  const srDetailPage = new SRDetailPage(page);
  const activityPage = new ActivityReviewPage(page);
  const srUrl = page.url();

  // Check whether the first ACTIVE step is blocked for Reviewer 1
  const blockingReviewer = await srDetailPage.getActiveStepAssignedReviewer();
  const reviewer2Username = (process.env.REVIEWER2_USERNAME || '').toLowerCase();

  if (blockingReviewer && blockingReviewer.toLowerCase().includes(reviewer2Username)) {
    console.log(`Active step blocked — assigned to "${blockingReviewer}". Switching to Reviewer 2 to unblock...`);
    await loginToPortal(page, process.env.REVIEWER2_USERNAME || '', process.env.REVIEWER2_PASSWORD || '');
    await page.goto(srUrl, { waitUntil: 'domcontentloaded' });
    await activityPage.processActivities(new MyRequestsPage(page));
    console.log('Reviewer 2 unblocking steps complete. Switching back to Reviewer 1...');
    await loginToPortal(page, process.env.REVIEWER1_USERNAME || '', process.env.REVIEWER1_PASSWORD || '');
    await page.goto(srUrl, { waitUntil: 'domcontentloaded' });
  }

  await activityPage.processActivities(myRequestsPage, 3);
  const state = getScenarioState(page);
  state.trackingNumber = await srDetailPage.getTrackingNumber();
  console.log(`Reviewer 1 done. Tracking number: "${state.trackingNumber}"`);
});

When('Reviewer 2 logs in to the portal', async ({ page }) => {
  await loginToPortal(page, process.env.REVIEWER2_USERNAME || '', process.env.REVIEWER2_PASSWORD || '');
  console.log(`Reviewer 2 logged in as: ${process.env.REVIEWER2_USERNAME}`);
});

When('Reviewer 2 navigates to the captured Service Request', async ({ page }) => {
  const state = getScenarioState(page);
  if (!state.trackingNumber) throw new Error('No tracking number captured from Reviewer 1.');
  await new MyRequestsPage(page).navigateToRequestByTrackingNumber(state.trackingNumber);
});

When('Reviewer 2 processes the remaining activity steps', async ({ page }) => {
  const myRequestsPage = new MyRequestsPage(page);
  await new ActivityReviewPage(page).processActivities(myRequestsPage);
});

