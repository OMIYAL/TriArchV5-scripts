import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { AuthLoginPage } from '../pages/auth-login.page';

/**
 * PORTAL AUTH SETUP — runs ONCE for Portal tests only.
 * Storefront tests do NOT use this.
 */
export const AUTH_STATE_FILE = path.join(__dirname, '../playwright/.auth/portal-auth-state.json');

setup('authenticate – portal login', async ({ page }) => {
  setup.setTimeout(120000);

  const tenantName   = process.env.TENANT_NAME   || 'fps';
  const userName     = process.env.USER_NAME      || '';
  const userPassword = process.env.USER_PASSWORD || '';

  if (!userName || !userPassword) {
    throw new Error(
      '❌ Portal Auth setup failed: USER_NAME and USER_PASSWORD must be set in .env'
    );
  }

  console.log(`\n🔐 Portal Auth Setup: Logging in as "${userName}"...`);

  // Navigate to Portal login
  const portalBaseUrl = process.env.PORTAL_BASE_URL || 'https://stg-portal.triarch.ai/';
  await page.goto(portalBaseUrl);
  
  // Wait for redirect to auth
  await page.waitForURL(/auth.*Login/, { timeout: 30000 });
  
  const authBaseUrl = process.env.AUTH_BASE_URL || 'https://stg-auth.triarch.ai';
  const loginPage = new AuthLoginPage(page, authBaseUrl);
  await loginPage.completeLoginFlow(tenantName, userName, userPassword);

  // Verify we are on Portal
  await expect(page).toHaveURL(/stg-portal\.triarch\.ai/, { timeout: 10000 });

  // Save Portal auth state
  await page.context().storageState({ path: AUTH_STATE_FILE });

  console.log(`✅ Portal auth state saved → ${AUTH_STATE_FILE}`);
});