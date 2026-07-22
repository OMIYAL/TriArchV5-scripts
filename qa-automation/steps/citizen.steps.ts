import { expect } from '@playwright/test';
import { Given, When, Then } from '../fixtures/mimik.fixture';
import { StorefrontHomePage } from '../pages/storefront/storefront-home.page';
import { ServicesListingPage } from '../pages/storefront/services-listing.page';
import { ServiceApplyPage } from '../pages/storefront/service-apply.page';
import { DocumentUploadComponent } from '../pages/storefront/document-upload.component';
import { AuthLoginPage } from '../pages/auth-login.page';
import { StripeCheckoutPage } from '../pages/stripe-checkout.page';
import { generateDynamicProjectData, DynamicProjectData } from '../utils/data-generator.helper';
import { fillApplicantFields } from '../utils/form-fill.helper';
import { closeSelect2Dropdown } from '../utils/select2.helper';
import { isMimikGuideMode } from '../utils/mimik.helper';
import { guideClick } from '../utils/mimik-action.helper';

let targetServiceUrl = '';
let currentProjectData: DynamicProjectData | null = null;

// ─────────────────────────────────────────────
// GIVEN
// ─────────────────────────────────────────────

Given('the citizen is on the Storefront home page', async ({ page }) => {
  const storefrontHome = new StorefrontHomePage(page);
  await storefrontHome.navigate(process.env.TENANT_NAME || '');
});

Given('the citizen navigates to an available service', async ({ page }) => {
  const servicesListing = new ServicesListingPage(page);
  await servicesListing.openListing(process.env.TENANT_NAME || '');

  if (process.env.SERVICE_NAME) {
    console.log(`Selecting configured service: ${process.env.SERVICE_NAME}`);
    targetServiceUrl = await servicesListing.navigateToService(process.env.SERVICE_NAME);
  } else {
    targetServiceUrl = await servicesListing.clickRandomAvailableService();
  }
});

// ─────────────────────────────────────────────
// WHEN
// ─────────────────────────────────────────────

When('the citizen logs in with valid credentials', async ({ page }) => {
  const usernameVisible = await page
    .getByRole('textbox', { name: 'Username', exact: true })
    .isVisible()
    .catch(() => false);

  // Already on storefront (e.g. session from a prior navigation) — skip the auth form.
  if (!usernameVisible && /storefront/i.test(page.url())) {
    console.log('Already on storefront without login form; skipping credential entry.');
  } else {
    const authLogin = new AuthLoginPage(page);
    await authLogin.completeLoginFlow(
      process.env.TENANT_NAME || '',
      process.env.CITIZEN_USERNAME || '',
      process.env.CITIZEN_PASSWORD || '',
    );
    const afterLoginWait = isMimikGuideMode()
      ? { timeout: 90000, waitUntil: 'commit' as const }
      : { timeout: 90000 };
    await page.waitForURL(/storefront/i, afterLoginWait);
  }

  if (!page.url().includes('/services/Apply') && targetServiceUrl) {
    let applyUrl = new URL(targetServiceUrl, process.env.STOREFRONT_BASE_URL || '');
    applyUrl.searchParams.set('__tenant', process.env.TENANT_NAME || '');
    await page.goto(applyUrl.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
});

When('creates a new project for the service application', async ({ page }) => {
  const serviceApply = new ServiceApplyPage(page);
  
  // Apply page may already have redirected to Create; combobox only exists on Apply.
  if (!/PermitProjects\/Create/i.test(page.url())) {
    await serviceApply.waitForProjectCombobox();
  }

  const createProjectPage = await serviceApply.openCreateProjectPopup();

  currentProjectData = generateDynamicProjectData();
  await createProjectPage.completeFullFlow(currentProjectData);

  const rawCreatePage = createProjectPage.getRawPage();
  await rawCreatePage.waitForURL(/projectId=|services\/Apply/i, { timeout: 60000 }).catch(() => {});

  const projectId =
    createProjectPage.getCreatedProjectId() ||
    new URL(rawCreatePage.isClosed() ? page.url() : rawCreatePage.url()).searchParams.get('projectId') ||
    new URL(page.url()).searchParams.get('projectId') ||
    '';

  // Only close a real popup — never close the main apply tab.
  if (!rawCreatePage.isClosed() && rawCreatePage !== page) {
    await rawCreatePage.close();
  }

  // Always land on Apply with projectId so the combobox binds without waiting on lookup.
  if (targetServiceUrl) {
    const applyUrl = new URL(targetServiceUrl, process.env.STOREFRONT_BASE_URL || '');
    applyUrl.searchParams.set('__tenant', process.env.TENANT_NAME || '');
    if (projectId) {
      applyUrl.searchParams.set('projectId', projectId);
      console.log(`Returning to Apply with projectId=${projectId}`);
    } else {
      console.log('No projectId captured after create — Apply may need dropdown selection.');
    }
    await page.goto(applyUrl.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } else if (/services\/Apply/i.test(page.url()) && projectId && !/projectId=/i.test(page.url())) {
    const applyUrl = new URL(page.url());
    applyUrl.searchParams.set('projectId', projectId);
    await page.goto(applyUrl.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } else {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(1000);
});

When('completes all required form steps and checklists', async ({ page }) => {
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
    await page.waitForTimeout(1000);
    await closeSelect2Dropdown(page);

    // Stop if we reach the payment step
    if (await payButton.isVisible().catch(() => false) || await page.getByRole('heading', { name: /intake fee/i }).isVisible().catch(() => false)) {
      console.log('Intake fee step reached.');
      return;
    }

    // Handle Checklist Step
    if (await page.getByText('Submission checklist', { exact: false }).isVisible().catch(() => false)) {
      const checklistInputs = page.locator('.ta-apply-checklist__input');
      const boxCount = await checklistInputs.count();
      for (let i = 0; i < boxCount; i++) {
        const box = checklistInputs.nth(i);
        if (!await box.isChecked()) {
          await box.check({ force: true }).catch(() => {});
        }
      }

      if (await nextButton.isVisible().catch(() => false)) {
        await guideClick(page, nextButton);
        await page.waitForLoadState('networkidle').catch(() => {});
        continue;
      }

      if (await submitButton.isVisible().catch(() => false)) {
        await guideClick(page, submitButton);
        await payButton.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
        return;
      }
      continue;
    }

    // Fill normal fields
    const emptyFields = page.locator('input:visible:not([readonly]):not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea:visible:not([readonly])');
    let hasEmpty = false;
    for (let i = 0; i < await emptyFields.count(); i++) {
      if (!(await emptyFields.nth(i).inputValue()).trim()) {
        hasEmpty = true; break;
      }
    }
    
    if (hasEmpty) {
      await fillApplicantFields(page, currentProjectData);
      await closeSelect2Dropdown(page);
    }

    // Upload Documents
    if (!serviceDocUploaded) {
      const uploaded = await new DocumentUploadComponent(page).uploadIfVisible(undefined, undefined, 'service');
      if (uploaded) serviceDocUploaded = true;
    }

    // Click Next
    if (await nextButton.isVisible().catch(() => false)) {
      await guideClick(page, nextButton);
      await page.waitForTimeout(2000);
    } else if (await submitButton.isVisible().catch(() => false)) {
      await guideClick(page, submitButton);
      await payButton.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
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
  await guideClick(page, payButton, { force: true });
  const popup = await popupPromise;

  const stripePage = popup || page;
  await new StripeCheckoutPage(stripePage).completePayment();
  await page.waitForURL(/storefront/, { timeout: 90000 }).catch(() => {});
});

// ─────────────────────────────────────────────
// THEN
// ─────────────────────────────────────────────

Then('the service request should be submitted successfully', async ({ page }) => {
  await page
    .getByText('Application submitted', { exact: false })
    .waitFor({ state: 'visible', timeout: 30000 });
});

Then('the tracking number and service request state should be saved', async ({ page }) => {
  await page.waitForTimeout(2000);
  const bodyText = await page.locator('body').innerText();
  const trackingMatch = bodyText.match(/([A-Z]{2,4}\d{3}\s*-\s*[A-Z]{2}\s*-\s*\d{4}\s*-\s*\d{5})/);
  const trackingNumber = trackingMatch ? trackingMatch[1].replace(/\s+/g, '') : 'not-found';

  console.log(`Tracking Number: ${trackingNumber}`);
  expect(trackingNumber).not.toBe('not-found');
});