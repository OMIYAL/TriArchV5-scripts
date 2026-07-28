import { createBdd } from 'playwright-bdd';
import { ActivityRevisionPage } from '../pages/control-room/activity-revision.page';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';

const { When, Before } = createBdd();

/**
 * Extends the test timeout for scenarios tagged @long-flow.
 * This covers multi-phase flows (reviewer → citizen → reviewer) that exceed
 * the default 4-minute global timeout. Scoped by tag so NO other test is affected.
 */
Before({ tags: '@long-flow' }, async ({ $testInfo }) => {
  $testInfo.setTimeout(600000); // 10 minutes — multi-phase reviewer + citizen flow
});


/**
 * Scans UNDER REVIEW SRs and attempts to process their activities until a Document Review
 * step is reached and marked for revision. If an SR is processed completely without
 * hitting a Document Review step, it goes back and tries the next SR.
 */
When('the Reviewer selects a Service Request and triggers the Document Review revision', async ({ page }) => {
  const myRequestsPage = new MyRequestsPage(page);
  const activityRevisionPage = new ActivityRevisionPage(page);
  await activityRevisionPage.selectAndTriggerRevision(myRequestsPage);
});

