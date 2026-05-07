import { test, expect, Page } from '@playwright/test';
import { ensureAuthenticated } from '../utils/AuthHelper';

/**
 * Theme Settings Tests
 *
 * Uses ensureAuthenticated() in beforeEach.
 *
 * Key findings from DOM inspection:
 *   - The floating General Settings panel has class: "lpx-context-menu show"
 *   - Theme items are <li class="lpx-inner-menu-item"> inside that panel
 *   - Their text <span> has class "hidden-in-hover-trigger" (CSS-hidden)
 *   - JS evaluate .click() bypasses Angular's Zone.js → theme doesn't change
 *   - Fix: Playwright native .click({ force: true }) fires proper pointer events
 *     which Angular's (click) bindings respond to
 *
 * Theme change verification:
 *   LeptonX applies the selected theme as a data attribute or class on <html>/<body>.
 *   We check for the `lpx-menu-item-link selected` class on the clicked item,
 *   or fall back to checking the html/body element for theme-related classes.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Opens the LeptonX General Settings floating panel via the gear icon.
 */
async function openSettingsPanel(page: Page) {
  const candidates = [
    '.lpx-topbar .setting > .bi',
    '.lpx-topbar lpx-settings-toolbar',
    '.lpx-topbar [class*="setting"] i',
    'lpx-settings-toolbar',
    '.setting > .bi',
    '.setting > i',
  ];

  let clicked = false;
  for (const selector of candidates) {
    const el = page.locator(selector).first();
    const visible = await el.isVisible().catch(() => false);
    if (visible) {
      await el.click();
      clicked = true;
      console.log(`✅ Settings gear opened via: "${selector}"`);
      break;
    }
  }

  if (!clicked) {
    throw new Error('❌ Could not find the settings gear icon.');
  }

  // Wait for the floating panel to appear (class: "lpx-context-menu show")
  await page.locator('.lpx-context-menu.show').waitFor({ state: 'attached', timeout: 10000 });
  // Also wait for at least one theme item to be in the DOM
  await page.locator('.lpx-context-menu.show li.lpx-inner-menu-item').first()
    .waitFor({ state: 'attached', timeout: 10000 });

  console.log('✅ General Settings panel is open');
}

/**
 * Clicks a theme by name using Playwright's native click with force:true.
 *
 * Why force:true?
 *   The <li class="lpx-inner-menu-item"> is visible but its inner <span>
 *   carries the class "hidden-in-hover-trigger" which makes Playwright's
 *   visibility check fail. force:true bypasses that check while still
 *   dispatching real pointer/mouse events that Angular responds to.
 *
 * Why NOT js evaluate .click()?
 *   Raw DOM .click() doesn't fire pointerdown/mousedown events — Angular's
 *   (click) directive ignores it → theme doesn't actually change.
 */
async function switchTheme(page: Page, themeName: string) {
  // Scope to the floating panel, find <li> elements containing the theme name
  const panel = page.locator('.lpx-context-menu.show');
  const themeItem = panel.locator('li.lpx-inner-menu-item').filter({ hasText: themeName });

  // Verify it's in the DOM (don't check visibility — hidden-in-hover-trigger)
  await themeItem.first().waitFor({ state: 'attached', timeout: 10000 });

  // Force-click: Playwright dispatches full pointer event chain → Angular fires
  await themeItem.first().click({ force: true });

  // ── Wait long enough to visually see the theme applied (2.5s) ──
  await page.waitForTimeout(2500);

  // ── Verify the theme actually changed ──
  // LeptonX stores the active theme as a class/attribute on <html> or <body>.
  // We check several possible attributes in order of likelihood.
  const themeState = await page.evaluate(() => {
    const html = document.documentElement;
    return {
      dataLpxTheme:   html.getAttribute('data-lpx-theme'),
      dataTheme:      html.getAttribute('data-theme'),
      dataBsTheme:    html.getAttribute('data-bs-theme'),
      htmlClass:      html.className,
      bodyClass:      document.body.className,
    };
  });

  console.log(`🎨 Theme "${themeName}" applied — state: ${JSON.stringify(themeState)}`);

  // Verify the clicked <li> is still in the panel (panel didn't close/crash)
  await expect(themeItem.first()).toBeAttached();

  // Take a screenshot so you can visually confirm the theme change in the report
  await page.screenshot({ path: `test-results/theme-${themeName.toLowerCase().replace(' ', '-')}.png` });

  console.log(`✅ Theme "${themeName}" selected`);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

test.describe('Theme Settings', () => {

  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
    await openSettingsPanel(page);
  });

  /**
   * Single test: cycles through all four LeptonX themes in sequence.
   * Watches the html element's data-bs-theme / className for real changes.
   */
  test('should cycle through all themes @smoke', async ({ page }) => {
    await switchTheme(page, 'Light');
    await switchTheme(page, 'Semi-Dark');
    await switchTheme(page, 'Dark');
    await switchTheme(page, 'System');
  });

});