import { createBdd } from 'playwright-bdd';
import { type TestInfo } from '@playwright/test';

const { Before } = createBdd();

/**
 * Extends the test timeout for scenarios tagged @long-flow.
 * This covers multi-phase flows (reviewer -> citizen -> reviewer) that exceed
 * the default global timeout. Scoped by tag so NO other test is affected.
 */
Before({ tags: '@long-flow' }, async ({ $testInfo }: { $testInfo: TestInfo }) => {
  $testInfo.setTimeout(600000); // 10 minutes
});
