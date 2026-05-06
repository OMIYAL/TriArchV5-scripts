import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { LoginPage } from '../pages/LoginPage';

/**
 * AUTH SETUP — runs ONCE before any browser test project.
 *
 * What it does:
 *   1. Launches a clean browser, runs the full login flow via LoginPage POM
 *   2. Saves the authenticated session (cookies + localStorage) to a JSON file
 *
 * All browser projects (chromium, firefox, webkit) read that file via
 * `storageState` in playwright.config.ts — so no test ever logs in again.
 */

// Where the authenticated browser state will be stored
export const AUTH_STATE_FILE = path.join(__dirname, '../playwright/.auth/auth-state.json');

setup('authenticate – login once for all tests', async ({ page }) => {
  setup.setTimeout(90000);

  const tenantName  = process.env.TENANT_NAME   || '';
  const userName    = process.env.USER_NAME      || '';
  const userPassword = process.env.USER_PASSWORD || '';

  // Validate env vars are present before attempting login
  if (!tenantName || !userName || !userPassword) {
    throw new Error(
      '❌ Auth setup failed: TENANT_NAME, USER_NAME, and USER_PASSWORD must be set in .env'
    );
  }

  console.log(`\n🔐 Auth Setup: Logging in as "${userName}" on tenant "${tenantName}"...`);

  const loginPage = new LoginPage(page);
  await loginPage.login(tenantName, userName, userPassword);

  // Verify we are actually on the authenticated portal before saving
  await expect(page).toHaveURL(/stg-portal\.triarch\.ai/, { timeout: 10000 });

  // Save cookies + localStorage so all tests can reuse this session
  await page.context().storageState({ path: AUTH_STATE_FILE });

  console.log(`✅ Auth state saved → ${AUTH_STATE_FILE}`);
});
