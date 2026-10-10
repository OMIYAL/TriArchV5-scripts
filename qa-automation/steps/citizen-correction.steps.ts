import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { getScenarioState } from '../utils/scenario-state';
import { faker } from '@faker-js/faker';
import { MyRequestsPage } from '../pages/storefront/my-requests.page';
import { getRandomTestPdf } from '../utils/document.helper';
import { DocumentUploadComponent } from '../pages/storefront/document-upload.component';

const { When, Given } = createBdd();

Given('the user session is cleared', async ({ page }) => {
  // A full teardown, in this order. Clearing cookies alone is NOT enough: it drops the
  // application's session cookie but leaves the identity provider's own session intact, so
  // the next actor logs in on top of a still-live IdP session for the previous actor. The
  // server then reconciles that mismatch on the next full page load — which is how the
  // citizen phase ended up silently logged out mid-scenario on a plain search-form GET.
  //
  // loginToPortal() in utils/auth.helper.ts already does this; this step did not.

  // 1. Clear storage FIRST, while the page is still on the application's origin.
  //    localStorage/sessionStorage are per-origin — clearing them after navigating to the
  //    auth host wipes the auth origin's storage and leaves the app's untouched.
  await page.evaluate(() => {
    try { localStorage.clear(); } catch { /* origin may deny access */ }
    try { sessionStorage.clear(); } catch { /* origin may deny access */ }
  }).catch(() => { /* about:blank or cross-origin — nothing to clear */ });

  // 2. End the OIDC session at the identity provider. This is the part that was missing.
  const authUrl = process.env.AUTH_BASE_URL || '';
  await page.goto(`${authUrl}/connect/endsession`, { waitUntil: 'domcontentloaded' })
    .catch((e) => console.log(`[session] endsession failed or timed out — continuing: ${e.message}`));

  // 3. Drop all cookies, now that the IdP has been told to end the session.
  await page.context().clearCookies();

  // 4. Clear again on the auth origin so no IdP-side remnants survive.
  await page.evaluate(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
    try { sessionStorage.clear(); } catch { /* ignore */ }
  }).catch(() => { /* ignore */ });

  console.log('[session] Session fully cleared (storage + endsession + cookies).');
});

const searchAndSelectByTrackingNumber = async (page: any, trackingNumber: string) => {
  const myRequestsPage = new MyRequestsPage(page);
  await myRequestsPage.navigateToMyRequests();
  await page.waitForLoadState('domcontentloaded');

  const executeSearch = async (): Promise<boolean> => {
    // Type the tracking number into the search box and submit
    const searchInput = page.locator('#FilterText, input[name="FilterText"], input.ta-toolbar__search-input').first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`Typing tracking number into search: ${trackingNumber}`);
      await searchInput.click();
      await searchInput.clear();
      // fill() is synchronous and reliable; pressSequentially is unnecessary overhead here
      await searchInput.fill(trackingNumber);

      const searchButton = page.locator('#ServiceRequestsSearchForm button[type="submit"], form button:has-text("Search"), button.btn-outline-secondary:has-text("Search")').first();
      if (await searchButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('Clicking Search button...');
        await searchButton.click();
      } else {
        console.log('Pressing Enter on search input...');
        await searchInput.press('Enter');
      }
    }

    // Wait directly for the specific tracking number row to appear.
    // The Storefront does a form GET reload (not an AJAX DataTables call), so there is
    // no .dataTables_processing spinner to wait on. The only reliable signal is the row
    // itself. 20s covers the observed 5-6s filter time with plenty of headroom.
    console.log(`Waiting up to 20s for row containing "${trackingNumber}"...`);
    const targetRow = page.locator('tbody tr').filter({ hasText: trackingNumber }).first();
    const found = await targetRow.waitFor({ state: 'visible', timeout: 20000 })
      .then(() => true)
      .catch(() => false);

    if (found) {
      console.log(`Row found for "${trackingNumber}". Clicking link...`);
      // Prefer the anchor link inside the row; fall back to clicking the row itself
      const link = targetRow.locator('a[href*="ServiceRequests"], a[href*="Request"]').first();
      if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
        await link.click();
      } else {
        await targetRow.locator('a').first().click();
      }
      await page.waitForLoadState('domcontentloaded');
      return true;
    }

    console.log(`Row for "${trackingNumber}" not visible within 20s.`);
    return false;
  };

  if (await executeSearch()) return;

  // Fallback: click 'All' pill then re-search with a fresh waitFor on the row
  console.log(`"${trackingNumber}" not visible after initial search. Clicking 'All' filter pill...`);
  const allFilterPill = page.getByRole('button', { name: 'All', exact: true }).first();
  if (await allFilterPill.isVisible({ timeout: 3000 }).catch(() => false)) {
    await allFilterPill.click();
    await page.waitForLoadState('domcontentloaded');
    if (await executeSearch()) return;
  }

  // Last resort: invoke base method
  await myRequestsPage.navigateToRequestByTrackingNumber(trackingNumber);
};

When('the citizen selects the Service Request for the current tracking ID which is in CORRECTION REQUIRED', async ({ page }) => {
  const state = getScenarioState(page);
  if (!state.trackingNumber) {
    throw new Error('No tracking number found in scenario state.');
  }
  await searchAndSelectByTrackingNumber(page, state.trackingNumber);
});


When('the citizen opens the Submit Corrections drawer', async ({ page }) => {
  const submitCorrectionsBtn = page.getByRole('button', { name: 'Submit corrections' }).first();
  await submitCorrectionsBtn.waitFor({ state: 'visible', timeout: 15000 });
  await submitCorrectionsBtn.click();

  // Wait for the Submit corrections drawer / offcanvas to open
  const notesInput = page.locator('#CorrectionNotesInput');
  await notesInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
    console.log('Warning: #CorrectionNotesInput not visible yet after clicking Submit corrections');
  });
});

When('the citizen uploads a pdf document for correction', async ({ page }) => {
  const pdfPath = getRandomTestPdf();

  // FIX (Finding 4, confirmed via screenshots of the actual running app): the correction
  // offcanvas has NO native `input[type="file"]` at all.
  // The real flow: clicking "Upload document" (#AddCorrectionDocumentButton) opens a
  // SEPARATE "Add supporting document" panel.
  // We use the shared DocumentUploadComponent (using 'any' mode to bypass service-specific assertions)
  // to handle the nested interactions safely.
  const uploader = new DocumentUploadComponent(page);
  await uploader.uploadRequired(pdfPath, undefined, 'any');

  // Hard assertion — check that a document item (div/li) was added to the list.
  await expect(page.locator('#CorrectionDocumentsList > *').first()).toBeVisible({ timeout: 10000 });
});

When('the citizen writes the correction notes', async ({ page }) => {
  const notesInput = page.locator('#CorrectionNotesInput');
  await notesInput.waitFor({ state: 'visible', timeout: 10000 });

  const correctionNote = `Citizen correction response: ${faker.lorem.paragraph()}`;
  console.log('Writing correction notes in #CorrectionNotesInput...');
  await notesInput.fill(correctionNote);
});

When('the citizen submits the correction', async ({ page }) => {
  const finalSubmitBtn = page.locator('form[action*="SubmitCorrection"] button[type="submit"], button[type="submit"]:has-text("Submit corrections")').first();
  await finalSubmitBtn.waitFor({ state: 'visible', timeout: 10000 });
  console.log('Clicking final Submit corrections button...');
  await finalSubmitBtn.click();

  // Wait for request detail / list to reload after submission
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);
});