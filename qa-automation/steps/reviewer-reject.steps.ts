import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { ActivityRevisionPage } from '../pages/control-room/activity-revision.page';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';

const { When, Then } = createBdd();

/**
 * Reject scenario — unique steps only.
 *
 * All login / navigation / redirect steps are already registered in reviewer.steps.ts
 * and are reused directly from the feature file without re-declaration here.
 *
 * The shared SR-scanning + per-step processing logic lives in ActivityRevisionPage
 * (selectAndTriggerRejection → processUntilFirstDocumentRejection → processUntilFirstDocumentStep).
 */

When(
  'the Reviewer selects a Service Request and triggers the Document Review rejection',
  async ({ page }) => {
    const myRequestsPage = new MyRequestsPage(page);
    const activityRevisionPage = new ActivityRevisionPage(page);
    await activityRevisionPage.selectAndTriggerRejection(myRequestsPage);
  },
);

Then('the activity status should be rejected', async ({ page }) => {
  await page.waitForLoadState('domcontentloaded');

  const rejectedActivity = page
    .locator('.ta-activity-lane')
    .filter({ hasText: /Document review/i })
    .filter({ hasText: /Rejected/i })
    .first();

  await expect(rejectedActivity).toBeVisible({ timeout: 30000 });
});

Then('the request status should be rejected', async ({ page }) => {
  await expect(page.locator('.ta-state-machine__subtitle strong')).toHaveText('Rejected', {
    timeout: 30000,
  });
});