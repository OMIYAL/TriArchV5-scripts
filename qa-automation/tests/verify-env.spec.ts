import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from '../utils/AuthHelper';

/**
 * Session / ENV Verification Test
 *
 * Confirms:
 *   1. All required .env variables are present
 *   2. Authentication works (either via storageState or fresh login)
 *   3. The portal is accessible in the authenticated state
 */
test('session verification – authenticated portal access', async ({ page }) => {
  test.setTimeout(90000);

  // --- 1. Confirm env variables are present ---
  const baseUrl      = process.env.BASE_URL      || '';
  const tenantName   = process.env.TENANT_NAME   || '';
  const userName     = process.env.USER_NAME      || '';
  const userPassword = process.env.USER_PASSWORD  || '';

  console.log(`\n✅ BASE_URL     : ${baseUrl}`);
  console.log(`✅ TENANT_NAME  : ${tenantName}`);
  console.log(`✅ USER_NAME    : ${userName}`);
  console.log(`✅ USER_PASSWORD: ${'*'.repeat(userPassword.length)}\n`);

  expect(baseUrl,      'BASE_URL missing from .env').toBeTruthy();
  expect(tenantName,   'TENANT_NAME missing from .env').toBeTruthy();
  expect(userName,     'USER_NAME missing from .env').toBeTruthy();
  expect(userPassword, 'USER_PASSWORD missing from .env').toBeTruthy();

  // --- 2. Navigate and authenticate (re-logins if session expired) ---
  await ensureAuthenticated(page);

  // --- 3. Confirm we are NOT on the login/auth page ---
  await expect(page).not.toHaveURL(/stg-auth\.triarch\.ai/, { timeout: 10000 });
  console.log('✅ Not on login page — session is active');

  // --- 4. Confirm we are on the authenticated portal ---
  await expect(page).toHaveURL(/stg-portal\.triarch\.ai/, { timeout: 10000 });
  const title = await page.title();
  console.log(`✅ Authenticated portal loaded — page title: "${title}"`);
});
