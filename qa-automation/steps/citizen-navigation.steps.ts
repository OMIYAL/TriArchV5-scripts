import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { StorefrontHomePage } from '../pages/storefront/storefront-home.page';
import { ServicesListingPage } from '../pages/storefront/services-listing.page';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';
import { SRDetailPage } from '../pages/sr-detail.page';
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
  // Verifies the final page is not an error/exception page. Each prior navigation step
  // in this scenario is responsible for its own assertions; this is a final safety net
  // that catches error pages the app may have silently landed on.
  //
  // innerText() is NOT wrapped in .catch() — a timeout or detached-frame error here IS
  // a genuine test failure (page crashed / never loaded) and must propagate, not be
  // silently swallowed as an empty string that trivially passes the regex check.
  const bodyText = await page.locator('body').innerText();

  // (?<![\w.,])404(?![\w.,]) matches "404" only when it appears as a standalone token —
  // not embedded inside a larger number or identifier:
  //   ✅ matches: "404", "HTTP 404", "Error 404", "404 Not Found"
  //   ❌ skips:   "36,404 sq ft", "36.404", "REQ404", "SKU404", "$1,404"
  //
  // Why not \b404\b?  \b fires at any word↔non-word transition; comma is non-word,
  // so "36,404" satisfies \b at the ,4 boundary — a false positive.
  // Why not (?<![\d,])404(?!\d)?  Misses period-grouped numbers (36.404) and is
  // looser than \b for letter-adjacent tokens (REQ404 matches because R∉[\d,]).
  expect(bodyText, 'Final page appears to be an error/exception page, not real content').not.toMatch(
    /Internal Server Error|Page not found|(?<![\w.,])404(?![\w.,])|An error occurred while processing your request/i
  );
  console.log(`All Storefront pages visited. Final URL: ${page.url()}`);
});
