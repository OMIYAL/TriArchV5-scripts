import { test, expect, Page } from '@playwright/test';
import { ensureAuthenticated } from '../utils/AuthHelper';

/**
 * Navigation Test
 *
 * Single test: Dashboard → StoreFront Settings (all 15 sub-pages).
 *
 * Key DOM facts:
 *   - Sidebar: #desktop-sidebar
 *   - Root wrapper: #lpx-wrapper class="hover-trigger full"
 *   - Sub-items: class="hidden-in-hover-trigger" → display:none UNLESS
 *     the mouse is hovering over the sidebar (CSS :hover on .hover-trigger)
 *
 * Fix strategy:
 *   1. Move the mouse INTO the sidebar area (activates CSS :hover → items visible)
 *   2. Click "StoreFront Settings" to expand the section
 *   3. Keep mouse in sidebar → sub-items stay visible
 *   4. Click the target sub-link normally (no force needed once visible)
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Moves the mouse into the sidebar to activate the CSS hover state.
 * This makes all "hidden-in-hover-trigger" items layout-visible.
 */
async function hoverSidebar(page: Page) {
  const sidebar = page.locator('#desktop-sidebar');
  const box = await sidebar.boundingBox();
  if (box) {
    // Move to center of sidebar
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300); // let CSS :hover state activate
  }
}

/**
 * Clicks a sidebar link by text.
 *
 * Steps:
 *  1. Hover the sidebar to make hidden-in-hover-trigger items visible
 *  2. Wait until the link is visible (not just attached)
 *  3. Click normally — no force needed once hover state is active
 */
async function clickSidebarLink(page: Page, linkText: string) {
  // Activate hover state so sub-items become visible
  await hoverSidebar(page);

  const sidebar = page.locator('#desktop-sidebar');
  const link = sidebar.locator('a').filter({ hasText: linkText }).first();

  // Wait for visible (hover state should have made it visible now)
  await link.waitFor({ state: 'visible', timeout: 10000 });
  await link.click();

  await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  await page.waitForTimeout(500);

  console.log(`✅ Navigated to "${linkText}"`);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

test.describe('Sidebar Navigation', () => {

  test.setTimeout(180000); // 3 min for 15+ pages

  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  /**
   * Single navigation test: visits Dashboard then all StoreFront Settings pages.
   * Count: 2 total (1 setup + 1 test).
   */
  test('should navigate through the portal sidebar @smoke', async ({ page }) => {

    // ── 1. Dashboard ──────────────────────────────────────────────────────────
    await clickSidebarLink(page, 'Dashboard');
    await expect(page).toHaveURL(/stg-portal\.triarch\.ai/, { timeout: 10000 });
    console.log('📌 Dashboard: ✅');

    // ── 2. StoreFront Settings → all sub-pages ────────────────────────────────
    const storefrontPages = [
      'Blog posts',
      'Blogs',
      'Comments',
      'FAQ',
      'Global resources',
      'Menus',
      'Newsletter users',
      'Page feedbacks',
      'Pages',
      'Polls',
      'Tags',
      'Url forwarding',
      'TriArchEvents',
      'Branding',
      'Forms',
    ];

    for (const pageName of storefrontPages) {
      // Hover sidebar first, then expand StoreFront Settings
      // (it collapses after each sub-page navigation)
      await clickSidebarLink(page, 'StoreFront Settings');

      // Hover sidebar again to keep hover state active for the sub-link
      await hoverSidebar(page);

      // Click the sub-page link (now visible because hover state is active)
      await clickSidebarLink(page, pageName);

      await expect(page).toHaveURL(/stg-portal\.triarch\.ai/, { timeout: 10000 });
      console.log(`📌 StoreFront → ${pageName}: ✅`);
    }

    console.log(`\n🎉 All ${storefrontPages.length + 1} navigation items verified.`);
  });

});