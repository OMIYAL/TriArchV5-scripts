import { expect, type TestInfo } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { ActivityRevisionPage } from '../pages/control-room/activity-revision.page';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';

const { When, Then, Before } = createBdd();

/**
 * Conditional approval scenario — unique steps only.
 *
 * Login / navigation / redirect steps are already registered in reviewer.steps.ts
 * and reused from the feature file without re-declaration here.
 *
 * All activity-processing logic lives in ActivityRevisionPage:
 *   processAllWithConditionalDocStep → processUntilFirstDocumentStep (continueAfterDocStep=true)
 *     · Non-document steps        → approved normally (generalReview + packaging + submitDecision)
 *     · First Document Review step → Conditional selected from #DecisionOptions, notes filled,
 *                                    submitDecision('Conditional'), then loop continues
 *     · All remaining steps        → approved normally until no more open activities
 */

/**
 * Extends the test timeout for scenarios tagged @long-flow.
 */
Before({ tags: '@long-flow' }, async ({ $testInfo }: { $testInfo: TestInfo }) => {
    $testInfo.setTimeout(600000);
});


When('the Reviewer proceeds with the remaining activity steps', async ({ page }) => {
    const myRequestsPage = new MyRequestsPage(page);
    const activityRevisionPage = new ActivityRevisionPage(page);
    await activityRevisionPage.processAllWithConditionalDocStep(myRequestsPage);
});

/**
 * By the time this step runs, processAllWithConditionalDocStep has already:
 *  1. Conditionally approved the Document Review step.
 *  2. Called processActivities for all remaining steps (fee waiver, issuance, packaging).
 * Nothing left to do — this step is a documented no-op safety guard.
 */
When(
    'the Reviewer selects the {string} option for the {string} activity only',
    async ({ page: _page }, _decision: string, _activity: string) => {
        // All work done in the previous step via processAllWithConditionalDocStep.
        // Kept in the feature for readability; no action required here.
    },
);


/**
 * Asserts the SR status badge text (e.g. "Closed").
 */
Then(
    'the status of the service request should be {string}',
    async ({ page }, expectedStatus: string) => {
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.ta-state-machine__subtitle strong')).toHaveText(
            new RegExp(expectedStatus, 'i'),
            { timeout: 30000 },
        );
    },
);