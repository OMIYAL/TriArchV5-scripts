import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { StorefrontHomePage } from '../pages/storefront/storefront-home.page';
import { ServicesListingPage } from '../pages/storefront/services-listing.page';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';
import { SRDetailPage } from '../pages/sr-detail.page';
import { BasePage } from '../pages/base.page';
import { scrollFromTop } from '../utils/scroll.helper';
import { getScenarioState } from '../utils/scenario-state';

const { When, Then } = createBdd();

When('the citizen clicks on the Log in button', async ({ page }) => {
  const loginButton = page.getByRole('button', { name: /Log in/i });
  const loginLink = page.getByRole('link', { name: /Log in/i });
  if (await loginButton.isVisible().catch(() => false)) {
    await loginButton.click();
  } else if (await loginLink.isVisible().catch(() => false)) {
    await loginLink.click();
  }
});

When('the user scrolls through the Home page completely', async ({ page }) => {
  await page.locator('#MenuItem_Services').first().waitFor({ state: 'visible', timeout: 15000 });
  await scrollFromTop(page);
});

When('the user navigates to the Services page and browses through all services', async ({ page }) => {
  const home = new StorefrontHomePage(page);
  await home.clickServices();
  await new ServicesListingPage(page).browseAllServices();
});

When('the user navigates to the About page and scrolls through it', async ({ page }) => {
  // Stg nav has "About us" — Prod nav has "News" in its place.
  const aboutUsLink = page.getByRole('link', { name: /About us/i }).first();
  const newsLink    = page.getByRole('link', { name: /^News$/i }).first();

  const hasAboutUs = await aboutUsLink.isVisible().catch(() => false);
  const hasNews    = await newsLink.isVisible().catch(() => false);
  if (!hasAboutUs && !hasNews) {
    throw new Error(
      'Neither "About us" (stg) nor "News" (prod) found in the storefront nav — nav labels may have drifted.',
    );
  }
  if (hasAboutUs) {
    await aboutUsLink.click();
  } else {
    await newsLink.click();
  }
  await page.waitForLoadState('domcontentloaded');
  await scrollFromTop(page);
});


When('the user navigates to the Service Requests page clicks reload and scrolls', async ({ page }) => {
  await new MyRequestsPage(page).navigateReloadAndScroll();
});

When('the user navigates to the My Projects page clicks reload and scrolls', async ({ page }) => {
  await new StorefrontHomePage(page).browseMyProjectsPage();
});

When('the citizen clicks on the My Requests', async ({ page }) => {
  const myRequestsPage = new MyRequestsPage(page);
  await myRequestsPage.navigateToMyRequests();
});

When('a list of requests appears', async ({ page }) => {
  await new MyRequestsPage(page).waitForListToLoad();
});

When('the citizen selects a closed status service request', async ({ page }) => {
  await new MyRequestsPage(page).selectClosedRequest();
});

Then('the citizen should be redirected to that closed service request', async ({ page }) => {
  await new SRDetailPage(page).verifyRedirectedToClosedRequest();
});

Then('the citizen selects view status history', async ({ page }) => {
  await new SRDetailPage(page).viewStatusHistory();
});

Then('the citizen selects Application form', async ({ page }) => {
  await new SRDetailPage(page).selectTab('Application form');
});

Then('the citizen selects Submission checklist', async ({ page }) => {
  await new SRDetailPage(page).selectTab('Submission checklist');
});

Then('the citizen selects Supporting documents', async ({ page }) => {
  await new SRDetailPage(page).selectTab('Supporting documents');
});

When('the citizen downloads all available documents', async ({ page }) => {
  const state = getScenarioState(page);
  const files = await new SRDetailPage(page).downloadAllDocuments();
  state.downloadedFiles = files;
});

Then('all documents should be downloaded successfully', async ({ page }) => {
  const state = getScenarioState(page);
  const downloadedFiles = state.downloadedFiles ?? [];
  expect(downloadedFiles.length).toBeGreaterThan(0);
  for (const download of downloadedFiles) {
    expect(download).not.toBeNull();
    console.log('Downloaded:', await (download as any).suggestedFilename());
  }
});

Then('all pages were successfully visited', async ({ page }) => {
  // ⚠ ASSUMPTION: this step is safe only in read-only navigation scenarios.
  // page.reload() below will re-POST/re-submit if used after a form submission,
  // decision drawer, or any other state-mutating action. Do not wire this step
  // into a scenario that performs mutations before reaching this point.

  // ── Layer 1: HTTP response status (deterministic 404/5xx detection) ──────
  // Reload the current page to capture the actual HTTP status code. Real 404/500/etc.
  // errors are caught here regardless of error page wording, locale, or template —
  // no regex matching on the number "404" needed.
  //
  // reload() is typed Promise<Response | null>; a null return (intercepted / cancelled
  // navigation) is treated as inconclusive — fall through to Layer 2 only.
  const response = await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  if (response !== null) {
    expect(
      response.status(),
      `Final page returned HTTP ${response.status()} — expected a 2xx/3xx success status`
    ).toBeLessThan(400);
  }

  // Wait for ABP loaders and overlays to clear after the reload before reading
  // body text — avoids Layer 2 reading a mid-load DOM (loading overlay vs. final content).
  await new BasePage(page).waitForLoaders();

  // ── Layer 2: Body text phrase check (catches soft-404 / 200-with-error-body) ─
  // Some apps return HTTP 200 for error pages (SPA fallback, custom handlers).
  // Check for recognisable error phrases as a secondary safety net.
  //
  // Intentionally omits standalone "404" number matching — that caused three
  // consecutive regressions (4981b2d → f60595b → 59bc11d) as each lookaround
  // fix broke a different edge case. Real HTTP 404s are handled by Layer 1;
  // this layer only needs recognisable error phrases.
  const bodyText = await page.locator('body').innerText();
  expect(bodyText, 'Final page appears to be an error/exception page').not.toMatch(
    /Internal Server Error|Page not found|An error occurred while processing your request/i
  );

  console.log(`All Storefront pages visited. Final URL: ${page.url()}`);
});
