import { createBdd } from 'playwright-bdd';
import { ActivityRevisionPage } from '../pages/control-room/activity-revision.page';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';

const { When } = createBdd();

/**
 * Scans UNDER REVIEW SRs and attempts to find one with an actionable General Review step.
 * When found, clicks "Mark All Sections Reviewed", opens the verdict drawer, selects
 * "Return as incomplete", fills the revision notes, and submits — putting the SR into
 * "Correction Required" state with the General Review lane marked ON HOLD.
 */
When(
  'the Reviewer selects a Service Request and triggers the General Review return as incomplete',
  async ({ page }) => {
    const myRequestsPage = new MyRequestsPage(page);
    const activityRevisionPage = new ActivityRevisionPage(page);
    await activityRevisionPage.selectAndTriggerReturnAsIncomplete(myRequestsPage);
  },
);
