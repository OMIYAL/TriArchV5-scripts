import { createBdd } from 'playwright-bdd';
import { expect, type Page } from '@playwright/test';
import { ActivityRevisionPage } from '../pages/control-room/activity-revision.page';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';
import { getScenarioState } from '../utils/scenario-state';

const { When, Then } = createBdd();

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

/**
 * Navigates the reviewer (already logged in) directly to the SR with the given
 * tracking number, found via the Control Room service-request list search.
 *
 * The `status` parameter is used to assert the displayed filter/status context
 * on the list page before selecting the row, ensuring we don't accidentally land
 * on an SR that is in the wrong state.
 */
When(
  'the Reviewer selects the Service Request for the current tracking ID which is in {string}',
  async ({ page }: { page: Page }, status: string) => {
    const state = getScenarioState(page);
    if (!state.trackingNumber) {
      throw new Error('No tracking number found in scenario state — cannot navigate to SR for reviewer.');
    }

    console.log(`Reviewer searching for SR: ${state.trackingNumber} (expected status: ${status})`);

    // Search via the Control Room SR list search box.
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="Tracking"]').first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill(state.trackingNumber);
      await searchInput.press('Enter');
    }

    // Wait for and click the row matching the tracking number.
    const row = page.locator('tbody tr').filter({ hasText: state.trackingNumber }).first();
    await row.waitFor({ state: 'visible', timeout: 20000 });
    // Don't use generic locator('a') because it matches hidden action dropdowns (e.g. <a class="dropdown-item">View</a>).
    // Target the link that contains the tracking number text.
    const link = row.getByRole('link', { name: state.trackingNumber }).first();
    await link.click();
    await page.waitForLoadState('domcontentloaded');

    // Assert that the SR is actually in the expected status on the detail page.
    await expect(
      page.locator('.ta-state-machine__subtitle strong'),
    ).toHaveText(new RegExp(status, 'i'), { timeout: 15000 });
  },
);
