import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { StorefrontHomePage } from '../pages/storefront/storefront-home.page';
import { ServicesListingPage } from '../pages/storefront/services-listing.page';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';
import { scrollFromTop } from '../utils/scroll.helper';

const { When, Then } = createBdd();

let myRequestsPage: MyRequestsPage;
let downloadedFiles: any[] = [];

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
  await page.waitForLoadState('networkidle').catch(() => { });
  await scrollFromTop(page);
});

When('the user navigates to the Services page and browses through all services', async ({ page }) => {
  const home = new StorefrontHomePage(page);
  await home.clickServices();
  const services = new ServicesListingPage(page);
  await services.browseAllServices();
});


When('the user navigates to the About page and scrolls through it', async ({ page }) => {
  const home = new StorefrontHomePage(page);
  await home.browseAboutPage();
});

When('the user navigates to the Service Requests page clicks reload and scrolls', async ({ page }) => {
  const myRequests = new MyRequestsPage(page);
  await myRequests.navigateReloadAndScroll();
});

When('the user navigates to the My Projects page clicks reload and scrolls', async ({ page }) => {
  const home = new StorefrontHomePage(page);
  await home.browseMyProjectsPage();
});

When('the citizen clicks on the My Requests', async ({ page }) => {
  myRequestsPage = new MyRequestsPage(page);
  await myRequestsPage.navigateToMyRequests();
});

When('a list of requests appears', async () => {
  await myRequestsPage.waitForListToLoad();
});

When('the citizen selects a closed status service request', async () => {
  await myRequestsPage.selectClosedRequest();
});

Then('the citizen should be redirected to that closed service request', async () => {
  await myRequestsPage.verifyRedirectedToClosedRequest();
});

Then('the citizen selects view status history', async () => {
  await myRequestsPage.viewStatusHistory();
});

Then('the citizen selects Application form', async () => {
  await myRequestsPage.selectTab('Application form');
});

Then('the citizen selects Submission checklist', async () => {
  await myRequestsPage.selectTab('Submission checklist');
});

Then('the citizen selects Supporting documents', async () => {
  await myRequestsPage.selectTab('Supporting documents');
});

When('the citizen downloads all available documents', async () => {
  downloadedFiles = await myRequestsPage.downloadAllDocuments();
});

Then('all documents should be downloaded successfully', async () => {
  expect(downloadedFiles.length).toBeGreaterThan(0);
  for (const download of downloadedFiles) {
    expect(download).not.toBeNull();
    console.log('Downloaded:', await download.suggestedFilename());
  }
});

Then('all pages were successfully visited', async ({ page }) => {
  console.log(`All Storefront pages visited. Final URL: ${page.url()}`);
});

