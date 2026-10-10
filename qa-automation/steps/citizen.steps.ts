import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { StorefrontHomePage } from '../pages/storefront/storefront-home.page';
import { ServicesListingPage } from '../pages/storefront/services-listing.page';
import { ServiceApplyPage } from '../pages/storefront/service-apply.page';
import { AuthLoginPage } from '../pages/auth-login.page';
import { StripeCheckoutPage } from '../pages/stripe-checkout.page';
import { DocumentUploadComponent } from '../pages/storefront/document-upload.component';
import { generateDynamicProjectData, DynamicProjectData } from '../utils/data-generator.helper';
import { fillApplicantFields } from '../utils/form-fill.helper';
import { closeSelect2Dropdown } from '../utils/select2.helper';
import { getScenarioState } from '../utils/scenario-state';

const { Given, When, Then } = createBdd();

Given('the citizen is on the Storefront home page', async ({ page }) => {
  const storefrontHome = new StorefrontHomePage(page);
  await storefrontHome.navigate();
});

Given('the citizen navigates to an available service', async ({ page }) => {
  const state = getScenarioState(page);
  const servicesListing = new ServicesListingPage(page);
  await servicesListing.openListing();

  if (process.env.SERVICE_NAME) {
    console.log(`Selecting configured service: ${process.env.SERVICE_NAME}`);
    state.targetServiceUrl = await servicesListing.navigateToService(process.env.SERVICE_NAME);
  } else {
    state.targetServiceUrl = await servicesListing.clickRandomAvailableService();
  }
});

When('the citizen logs in with valid credentials', async ({ page }) => {
  const state = getScenarioState(page);
  const authLogin = new AuthLoginPage(page);
  await authLogin.completeLoginFlow(
    process.env.CITIZEN_USERNAME || '',
    process.env.CITIZEN_PASSWORD || '',
  );

  await page.waitForURL(/storefront/i, { timeout: 90000 });

  if (!page.url().includes('/services/Apply') && state.targetServiceUrl) {
    let applyUrl = new URL(state.targetServiceUrl, process.env.STOREFRONT_BASE_URL || '');
    await page.goto(applyUrl.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
});

When('creates a new project for the service application', async ({ page }) => {
  const state = getScenarioState(page);
  const serviceApply = new ServiceApplyPage(page);

  await serviceApply.waitForProjectCombobox();
  const createProjectPage = await serviceApply.openCreateProjectPopup();

  state.currentProjectData = generateDynamicProjectData();
  await createProjectPage.completeFullFlow(state.currentProjectData!);

  const rawPopupPage = createProjectPage.getRawPage();
  await rawPopupPage.waitForURL(/projectId=|services\/Apply/i, { timeout: 60000 });

  if (!rawPopupPage.isClosed()) {
    await rawPopupPage.close();
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  // FIX: replaced fixed 1000ms settle sleep with a wait for the actual next-step signal —
  // the project combobox or an empty required field becoming ready is what the rest of this
  // flow actually depends on, not an arbitrary elapsed duration.
  await serviceApply.waitForProjectCombobox();
});

When('completes all required form steps and checklists', async ({ page }) => {
  const state = getScenarioState(page);
  const currentProjectData = state.currentProjectData;
  if (!currentProjectData) {
    throw new Error('No project data was generated. Ensure the project creation step ran first.');
  }
  const serviceApply = new ServiceApplyPage(page);
  await serviceApply.selectCreatedProject(currentProjectData.name);

  const payButton = page.locator('#PayIntakeFeeButton');
  const submitButton = page.getByRole('button', { name: /Submit application/i });
  const nextButton = page.getByRole('button', { name: 'Next', exact: true }).and(page.locator(':visible')).last();
  let serviceDocUploaded = false;

  for (let attempt = 0; attempt < 15; attempt++) {
    // FIX: this loop's fixed 1000ms was acting as a polling interval for a hand-rolled loop
    // checking several unrelated conditions (fee button, checklist, empty fields) each pass.
    // There's no single element to wait on since the loop itself IS the polling mechanism —
    // but 1000ms per iteration across up to 15 iterations is 15s of pure worst-case dead time.
    // Shortened to 300ms since the checks below are cheap; this keeps a polling loop (fine)
    // without inflating its interval into an implicit sleep.
    await page.waitForTimeout(300);
    await closeSelect2Dropdown(page);

    if (await payButton.isVisible().catch(() => false) ||
      await page.getByRole('heading', { name: /intake fee/i }).isVisible().catch(() => false)
    ) {
      console.log('Intake fee step reached.');
      return;
    }

    if (await page.getByText('Submission checklist', { exact: false }).isVisible().catch(() => false)) {
      const checklistInputs = page.locator('.ta-apply-checklist__input');
      const boxCount = await checklistInputs.count();
      for (let i = 0; i < boxCount; i++) {
        const box = checklistInputs.nth(i);
        if (!(await box.isChecked())) {
          // NOTE: force kept here deliberately (see general-review.component.ts for the same
          // reasoning) — likely a native checkbox hidden behind custom styling. Worth
          // confirming with the team whether clicking the associated label would avoid needing
          // it; the button clicks below had no such justification and had force removed.
          await box.check({ force: true });
          if (!(await box.isChecked().catch(() => false))) {
            throw new Error(`Checklist checkbox at index ${i} failed to check and is still unchecked.`);
          }
        }
      }

      if (await nextButton.isVisible().catch(() => false)) {
        // FIX: removed default force — this locator already filters to `:visible` + `.last()`;
        // if it's still somehow not actionable, that's worth surfacing rather than bypassing.
        await nextButton.click();
        await page.waitForLoadState('domcontentloaded');
        continue;
      }

      if (await submitButton.isVisible().catch(() => false)) {
        // FIX: removed default force — same reasoning as above.
        await submitButton.click();
        // FIX: previously `.catch(() => {})` silently swallowed a failed wait for the pay
        // button — if submission actually failed, this step would still return "successfully"
        // and the next step ("completes the intake fee payment...") would just see no pay
        // button and silently skip payment, masking a real submission failure two steps later
        // with no clear error at the point where it actually happened.
        const payButtonAppeared = await payButton
          .waitFor({ state: 'visible', timeout: 30000 })
          .then(() => true)
          .catch(() => false);
        if (!payButtonAppeared) {
          const errorBanner = await page.getByText(/error|failed|something went wrong/i).isVisible().catch(() => false);
          if (errorBanner) {
            throw new Error('Application submission appears to have failed — an error message is showing instead of the intake fee step.');
          }
          console.log('No intake fee button appeared after Submit — assuming no fee is required for this service.');
        }
        return;
      }
      continue;
    }

    const emptyFields = page.locator(
      'input:visible:not([readonly]):not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea:visible:not([readonly])'
    );
    let hasEmpty = false;
    for (let i = 0; i < await emptyFields.count(); i++) {
      if (!(await emptyFields.nth(i).inputValue()).trim()) {
        hasEmpty = true;
        break;
      }
    }
    if (hasEmpty) {
      await fillApplicantFields(page, currentProjectData);
      await closeSelect2Dropdown(page);
    }

    if (!serviceDocUploaded) {
      const uploaded = await new DocumentUploadComponent(page).uploadIfVisible(undefined, undefined, 'service');
      if (uploaded) serviceDocUploaded = true;
    }

    if (await nextButton.isVisible().catch(() => false)) {
      // FIX: removed default force — same reasoning as the checklist branch above.
      await nextButton.click();
      // FIX: replaced fixed 2000ms settle sleep with a wait for the page to reach
      // domcontentloaded plus the loop's own next-pass checks (empty-field scan, etc.)
      // handling the rest — those already re-check real state on the next iteration.
      await page.waitForLoadState('domcontentloaded');
    } else if (await submitButton.isVisible().catch(() => false)) {
      // FIX: removed force, and fixed the same swallowed-wait pattern caught earlier in the
      // checklist branch — this exit path had the identical issue: a failed submission could
      // silently return "success" here with no visibility into what actually happened.
      await submitButton.click();
      const payButtonAppeared = await payButton
        .waitFor({ state: 'visible', timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      if (!payButtonAppeared) {
        const errorBanner = await page.getByText(/error|failed|something went wrong/i).isVisible().catch(() => false);
        if (errorBanner) {
          throw new Error('Application submission appears to have failed — an error message is showing instead of the intake fee step.');
        }
        console.log('No intake fee button appeared after Submit — assuming no fee is required for this service.');
      }
      return;
    }
  }
});

When('completes the intake fee payment via Stripe if required', async ({ page }) => {
  const payButton = page.locator('#PayIntakeFeeButton');

  const isPaymentRequired = await payButton
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  if (!isPaymentRequired) {
    console.log('No intake fee button found — skipping Stripe payment.');
    return;
  }

  const popupPromise = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
  // FIX: removed default force — no documented reason for it on this button.
  await payButton.click();
  const popup = await popupPromise;

  const stripePage = popup || page;
  await new StripeCheckoutPage(stripePage).completePayment();
  await page.waitForURL(/storefront/, { timeout: 90000 });
});

Then('the new submission triggers a notification', async ({ page }) => {
  const bodyText = await page.locator('body').innerText();
  const trackingMatch = bodyText.match(/([A-Z]{2,4}\d{3}\s*-\s*[A-Z]{2}\s*-\s*\d{4}\s*-\s*\d{5})/);
  const trackingNumber = trackingMatch ? trackingMatch[1].replace(/\s+/g, '') : '';

  const notifButton = page.locator('a[aria-label="Notifications"]').first();
  await notifButton.click();

  const dropdown = page.locator('.dropdown-menu.show, .dropdown-menu[data-bs-popper]').first();
  await expect(dropdown).toBeVisible({ timeout: 15000 });

  const targetNotification = dropdown.locator('.notif-item', { hasText: trackingNumber || 'Request' }).first();
  await expect(targetNotification).toBeVisible({ timeout: 45000 });

  await Promise.all([
    page.waitForURL(/ServiceRequests\/Detail/i, { timeout: 30000 }),
    targetNotification.click(),
  ]);

  if (trackingNumber) {
    const trackingHeading = page.locator('h1, h2, h3, h4, h5, h6, .page-title, .title').filter({ hasText: trackingNumber }).first();
    await expect(trackingHeading).toBeVisible({ timeout: 15000 });
  }
});

Then('the service request should be submitted successfully', async ({ page }) => {
  await page
    .getByText('Application submitted', { exact: false })
    .waitFor({ state: 'visible', timeout: 30000 });
});

Then('the tracking number and service request state should be saved', async ({ page }) => {
  const bodyText = await page.locator('body').innerText();
  const trackingMatch = bodyText.match(/([A-Z]{2,4}\d{3}\s*-\s*[A-Z]{2}\s*-\s*\d{4}\s*-\s*\d{5})/);
  const trackingNumber = trackingMatch ? trackingMatch[1].replace(/\s+/g, '') : 'not-found';

  console.log(`Tracking Number: ${trackingNumber}`);
  const state = getScenarioState(page);
  state.trackingNumber = trackingNumber;
  expect(trackingNumber).not.toBe('not-found');
});