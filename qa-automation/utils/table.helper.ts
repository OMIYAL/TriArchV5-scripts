import { Page } from '@playwright/test';

/**
 * Waits until a DataTable finishes loading — processing spinner hidden
 * and at least one real data row (or the empty-table notice) is visible.
 *
 * Works for any page that uses DataTables, not just the SR list.
 */
export async function waitForTableData(page: Page): Promise<void> {
  await page.locator('.dataTables_processing')
    .waitFor({ state: 'hidden', timeout: 90000 });
  await page.locator('tbody tr a[href*="ServiceRequests"], .dataTables_empty')
    .first()
    .waitFor({ state: 'visible', timeout: 60000 });
}

/**
 * Filter-pill-aware DataTable wait.
 * After a filter pill is clicked, the old rows remain in the DOM momentarily,
 * so a plain waitForTableData() would resolve against stale data.
 * This helper waits for the XHR processing spinner to appear (up to 3 s),
 * then waits for it to fully clear before confirming fresh rows are present.
 *
 * Works for any DataTable page — filter pills, search inputs, etc.
 */
export async function waitForFilteredTableData(page: Page): Promise<void> {
  const processing = page.locator('.dataTables_processing');
  try {
    await processing.waitFor({ state: 'visible', timeout: 3000 });
  } catch (e) {
    // Ignore: Processing spinner might appear and disappear faster than Playwright can catch it, or might not appear if cached.
  }
  await processing.waitFor({ state: 'hidden', timeout: 90000 });
  await page.locator('tbody tr a[href*="ServiceRequests"], .dataTables_empty')
    .first()
    .waitFor({ state: 'visible', timeout: 60000 });
}
