import { createBdd } from 'playwright-bdd';
import { Page } from '@playwright/test';
import { AuthLoginPage } from '../pages/auth-login.page';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';
import { PortalSRDetailPage } from '../pages/control-room/portal-sr-detail.page';

const { Given, When, Then } = createBdd();

// ─── Reviewer label → env var username mapping ────────────────────────────────
// Gherkin uses generic labels ("Reviewer 1", "Reviewer 2") so that no real
// usernames or display names are ever hardcoded in the feature files.
function resolveReviewerUsername(label: string): string {
  const map: Record<string, string> = {
    'Reviewer 1': process.env.REVIEWER1_USERNAME || '',
    'Reviewer 2': process.env.REVIEWER2_USERNAME || '',
  };
  const resolved = map[label] ?? label;
  if (!resolved) throw new Error(`No username found for reviewer label "${label}". Check .env REVIEWER1_USERNAME / REVIEWER2_USERNAME.`);
  return resolved;
}

// ─── Shared login helper (same pattern as dual-reviewer.steps.ts) ─────────────
async function loginToPortal(page: Page, username: string, password: string): Promise<void> {
  const portalUrl = process.env.PORTAL_BASE_URL || '';
  const tenant = process.env.TENANT_NAME || 'fps';

  // Clear session to avoid stale auth state from a previous test
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

// ─── Step definitions ─────────────────────────────────────────────────────────

Given('the Coordinator is logged in to the portal', async ({ page }) => {
  await loginToPortal(
    page,
    process.env.COORDINATOR_USERNAME || '',
    process.env.COORDINATOR_PASSWORD || '',
  );
  console.log(`Coordinator logged in as: ${process.env.COORDINATOR_USERNAME}`);
});

When('the Coordinator opens a Pending Intake Service Request', async ({ page }) => {
  await new MyRequestsPage(page).findAndOpenPendingIntakeSR();
});

Then('the Coordinator assigns all activity steps to {string}', async ({ page }, reviewerLabel: string) => {
  const username = resolveReviewerUsername(reviewerLabel);
  await new PortalSRDetailPage(page).assignReviewerToSteps(username); // count=-1 → all steps
});

Then('the Coordinator assigns the first 3 activity steps to {string}', async ({ page }, reviewerLabel: string) => {
  const username = resolveReviewerUsername(reviewerLabel);
  await new PortalSRDetailPage(page).assignReviewerToSteps(username, 3);
});

Then('the Coordinator assigns the remaining activity steps to {string}', async ({ page }, reviewerLabel: string) => {
  const username = resolveReviewerUsername(reviewerLabel);
  await new PortalSRDetailPage(page).assignReviewerToSteps(username); // count=-1 → all remaining
});

Then('the Coordinator launches the review', async ({ page }) => {
  await new PortalSRDetailPage(page).launchReview();
});

Then('the Service Request moves to Under Review', async ({ page }) => {
  await new PortalSRDetailPage(page).verifyUnderReview();
});
