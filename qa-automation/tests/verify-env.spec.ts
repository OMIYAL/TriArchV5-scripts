import { test, expect } from '@playwright/test';

/**
 * SESSION VERIFICATION TEST
 *
 * Confirms that:
 *   1. The .env variables are correctly loaded
 *   2. The saved auth session (storageState from auth.setup.ts) is active
 *   3. The browser starts already authenticated — no login screen
 *
 * This test does NOT perform a login — that already happened in auth.setup.ts.
 */
test('session verification – authenticated portal access', async ({ page }) => {
  test.setTimeout(30000);

  // --- 1. Confirm env variables are present ---
  const baseUrl      = process.env.BASE_URL     || '';
  const tenantName   = process.env.TENANT_NAME  || '';
  const userName     = process.env.USER_NAME    || '';
  const userPassword = process.env.USER_PASSWORD || '';

  console.log(`\n✅ BASE_URL     : ${baseUrl}`);
  console.log(`✅ TENANT_NAME  : ${tenantName}`);
  console.log(`✅ USER_NAME    : ${userName}`);
  console.log(`✅ USER_PASSWORD: ${'*'.repeat(userPassword.length)}\n`);

  expect(baseUrl,      'BASE_URL missing from .env').toBeTruthy();
  expect(tenantName,   'TENANT_NAME missing from .env').toBeTruthy();
  expect(userName,     'USER_NAME missing from .env').toBeTruthy();
  expect(userPassword, 'USER_PASSWORD missing from .env').toBeTruthy();

  // --- 2. Navigate to the portal — should land in the app, not the login page ---
  await page.goto(baseUrl);
  console.log(`✅ Navigated to ${baseUrl}`);

  // --- 3. Confirm we are NOT on the login/auth page ---
  await expect(page).not.toHaveURL(/stg-auth\.triarch\.ai/, { timeout: 10000 });
  console.log('✅ Not redirected to login — session is active');

  // --- 4. Confirm we are on the authenticated portal ---
  await expect(page).toHaveURL(/stg-portal\.triarch\.ai/, { timeout: 10000 });
  const title = await page.title();
  console.log(`✅ Authenticated portal loaded — page title: "${title}"`);

  // Success: the session is valid and no login was needed
});
