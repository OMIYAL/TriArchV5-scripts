import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { AuthLoginPage } from '../pages/auth-login.page';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';
import { ActivityReviewPage } from '../pages/control-room/activity-review.page';

const { Given, When, Then } = createBdd();

Given('that the Reviewer is on the Landing page of the portal', async ({ page }) => {
  const portalUrl = process.env.PORTAL_BASE_URL || '';
  await page.goto(portalUrl);
  
  const loginLink = page.getByRole('link', { name: /Log in|Sign in/i }).first();
  await loginLink.waitFor({ state: 'visible', timeout: 15000 });
  await loginLink.click();
});

Given('the Reviewer logs in with valid credentials', async ({ page }) => {
  const authLogin = new AuthLoginPage(page);
  await authLogin.completeLoginFlow(
    process.env.REVIEWER_USERNAME || '',
    process.env.REVIEWER_PASSWORD || '',
    /ControlRoom/i
  );
});

Then('the Reviewer gets redirected to home page dashboard', async ({ page }) => {
  await expect(page).toHaveURL(/ControlRoom\/Dashboards\/MyDay/i, { timeout: 30000 });
});

When('the Reviewer navigates to the Service Requests page', async ({ page }) => {
  const requestsPage = new MyRequestsPage(page);
  await requestsPage.navigateToMyRequests();
});

When('the Reviewer selects a Service Request which is UNDER REVIEW', async ({ page }) => {
  const requestsPage = new MyRequestsPage(page);
  const activityPage = new ActivityReviewPage(page);
  // requireSingleReviewer=true: skip any SR assigned to more than one reviewer,
  // since the active activity step won't be available for this reviewer until
  // the other reviewer completes their parallel step first.
  //
  // The predicate is a read-only probe run on the SR detail page — it navigates nowhere, so
  // the page is left on the selected SR for the following step. Returning false makes the
  // scanner move on to the next candidate.
  await requestsPage.selectActiveRequest(true, false, async () => {
    if (await activityPage.documentReviewHasFinalReport()) {
      console.log('[stale-guard] Document review already has a final report — skipping this SR.');
      return false;
    }
    return true;
  });
});

Then('the Reviewer gets redirected to the Specific Request', async ({ page }) => {
  // Detail (and Activity) pages keep widgets loading — do not wait for full 'load'.
  if (/ServiceRequests\/(Detail|Activity)/i.test(page.url())) {
    return;
  }
  await page.waitForURL(/ServiceRequests\/(Detail|Activity)/i, {
    timeout: 30000,
    waitUntil: 'domcontentloaded',
  });
});

When('the Reviewer opens the next active activity step', async ({ page }) => {
  const requestsPage = new MyRequestsPage(page);
  await requestsPage.openNextActiveActivity();
});

When('the Reviewer annotates the document and adds a comment', async ({ page }) => {
  const activityReviewPage = new ActivityReviewPage(page);
  await activityReviewPage.annotateAndComment();
});

When('the Reviewer clicks Save and Next', async ({ page }) => {
  const activityReviewPage = new ActivityReviewPage(page);
  await activityReviewPage.clickSaveAndNext();
});

When('the Reviewer reviews the generated report', async ({ page }) => {
  const activityReviewPage = new ActivityReviewPage(page);
  await activityReviewPage.reviewReport();
});

When('the Reviewer processes all active activities', async ({ page }) => {
  const myRequestsPage = new MyRequestsPage(page);
  const activityReviewPage = new ActivityReviewPage(page);
  await activityReviewPage.processActivities(myRequestsPage);
});

