import { createBdd } from 'playwright-bdd';
import { AuthLoginPage } from '../pages/auth-login.page';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';
import { ActivityReviewPage } from '../pages/control-room/activity-review.page';
import { Page } from '@playwright/test';

const { When, Given } = createBdd();

// Shared state: tracking number captured from Reviewer 1, consumed by Reviewer 2.
let capturedTrackingNumber = '';

async function loginToPortal(page: Page, username: string, password: string): Promise<void> {
  const portalUrl = process.env.PORTAL_BASE_URL || '';
  const authUrl = process.env.AUTH_BASE_URL || '';
  const tenant = process.env.TENANT_NAME || 'fps';

  await page.goto(`${authUrl}/connect/endsession`, { waitUntil: 'domcontentloaded' }).catch(() => { });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });

  await page.context().clearCookies();
  await page.evaluate(() => {
    try { localStorage.clear(); } catch { }
    try { sessionStorage.clear(); } catch { }
  });

  await page.goto(`${portalUrl}?__tenant=${tenant}`);
  const loginLink = page.getByRole('link', { name: /Log in|Sign in/i }).first();
  await loginLink.waitFor({ state: 'visible', timeout: 20000 });
  await loginLink.click();
  await new AuthLoginPage(page).completeLoginFlow(tenant, username, password, /ControlRoom/i);
}

Given('Reviewer 1 logs in with Reviewer 1 credentials', async ({ page }) => {
  await loginToPortal(page, process.env.REVIEWER1_USERNAME || '', process.env.REVIEWER1_PASSWORD || '');
  console.log(`Reviewer 1 logged in as: ${process.env.REVIEWER1_USERNAME}`);
});

When('Reviewer 1 processes the first 3 activity steps and captures the tracking number', async ({ page }) => {
  const myRequestsPage = new MyRequestsPage(page);
  await new ActivityReviewPage(page).processActivities(myRequestsPage, 3);
  capturedTrackingNumber = await myRequestsPage.getTrackingNumber();
  console.log(`Reviewer 1 done. Tracking number: "${capturedTrackingNumber}"`);
});

When('Reviewer 2 logs in to the portal', async ({ page }) => {
  await loginToPortal(page, process.env.REVIEWER2_USERNAME || '', process.env.REVIEWER2_PASSWORD || '');
  console.log(`Reviewer 2 logged in as: ${process.env.REVIEWER2_USERNAME}`);
});

When('Reviewer 2 navigates to the captured Service Request', async ({ page }) => {
  if (!capturedTrackingNumber) throw new Error('No tracking number captured from Reviewer 1.');
  await new MyRequestsPage(page).navigateToRequestByTrackingNumber(capturedTrackingNumber);
});

When('Reviewer 2 processes the remaining activity steps', async ({ page }) => {
  const myRequestsPage = new MyRequestsPage(page);
  await new ActivityReviewPage(page).processActivities(myRequestsPage);
});

