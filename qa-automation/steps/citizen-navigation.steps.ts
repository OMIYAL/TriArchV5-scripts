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
  // FIX: this step previously only console.log'd the URL and asserted nothing — every prior
  // navigation step in this scenario could have silently failed (e.g. landed on an error page,
  // or never left the previous page) and this step would still report success. Now it verifies
  // there's no error/exception page and that the browser actually left the initial landing URL.
  const bodyText = await page.locator('body').innerText().catch(() => '');
  expect(bodyText, 'Final page appears to be an error/exception page, not real content').not.toMatch(
    /Internal Server Error|Page not found|404|An error occurred while processing your request/i
  );
  console.log(`All Storefront pages visited. Final URL: ${page.url()}`);
});
