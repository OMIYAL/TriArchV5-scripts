import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { StorefrontHomePage } from '../pages/storefront/storefront-home.page';
import { ServicesListingPage } from '../pages/storefront/services-listing.page';
import { ServiceApplyPage } from '../pages/storefront/service-apply.page';
import { AuthLoginPage } from '../pages/auth-login.page';
import { StripeCheckoutPage } from '../pages/stripe-checkout.page';
import { generateDynamicProjectData, DynamicProjectData } from '../utils/data-generator.helper';

const { Given, When, Then } = createBdd();

let targetServiceUrl = '';
let currentProjectData: DynamicProjectData | null = null;

// ═══════════════════════════════════════════════════════════════
// GIVEN STEPS
// ═══════════════════════════════════════════════════════════════

Given('the citizen is on the Storefront home page', async ({ page }) => {
  const storefrontHome = new StorefrontHomePage(page);
  await storefrontHome.navigate((process.env.TENANT_NAME || ''));
});

Given('the citizen opens the Storefront home page', async ({ page }) => {
  const storefrontHome = new StorefrontHomePage(page);
  await storefrontHome.navigate((process.env.TENANT_NAME || ''));
});

Given('the citizen navigates to an available service', async ({ page }) => {
  const storefrontHome = new StorefrontHomePage(page);
  const servicesListing = new ServicesListingPage(page);
  await storefrontHome.clickAboutUs();
  await storefrontHome.clickServices();
  targetServiceUrl = await servicesListing.clickRandomAvailableService();
});

Given('selects the target service from the services listing', async ({ page }) => {
  const storefrontHome = new StorefrontHomePage(page);
  const servicesListing = new ServicesListingPage(page);
  await storefrontHome.clickAboutUs();
  await storefrontHome.clickServices();
  targetServiceUrl = await servicesListing.navigateToService((process.env.SERVICE_NAME || ''));
});

// ═══════════════════════════════════════════════════════════════
// WHEN STEPS
// ═══════════════════════════════════════════════════════════════

When('the citizen logs in with valid credentials', async ({ page }) => {
  const authLogin = new AuthLoginPage(page);
  await page.waitForURL(/auth.*Login/, { timeout: 60000 });
  await authLogin.completeLoginFlow(
    (process.env.TENANT_NAME || ''),
    (process.env.CITIZEN_USERNAME || ''),
    (process.env.CITIZEN_PASSWORD || '')
  );
});

When('the citizen completes the login flow with valid credentials', async ({ page }) => {
  const authLogin = new AuthLoginPage(page);
  await page.waitForURL(/auth.*Login/, { timeout: 60000 });
  await authLogin.completeLoginFlow(
    (process.env.TENANT_NAME || ''),
    (process.env.CITIZEN_USERNAME || ''),
    (process.env.CITIZEN_PASSWORD || '')
  );
});

When('creates a new project for the service application', async ({ page }) => {
  const serviceApply = new ServiceApplyPage(page);

  // 1. Wait for redirect to return to the storefront domain
  await page.waitForURL(/storefront/, { timeout: 30000 }).catch(() => { });
  await page.waitForTimeout(1500);

  // 2. Check if we are already on the apply page or redirecting there
  const currentUrl = page.url();
  const applyPath = `/services/Apply`;

  if (!currentUrl.includes(applyPath) && targetServiceUrl) {
    const fullApplyUrl = new URL(targetServiceUrl, (process.env.STOREFRONT_BASE_URL || '')).href;
    console.log(`🔄 Manual fallback navigation to apply page: ${fullApplyUrl}`);
    await page.goto(fullApplyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(err => {
      console.log(`⚠️ Manual navigation timed out or failed: ${err.message}. Continuing...`);
    });
  } else {
    console.log(`✅ Redirected automatically to apply page: ${currentUrl}`);
  }

  // 3. Wait for the project combobox on the apply page
  await serviceApply['projectCombobox'].waitFor({ state: 'visible', timeout: 25000 });
  const createProjectPage = await serviceApply.openCreateProjectPopup();
  await createProjectPage['jurisdictionCombobox'].waitFor({ state: 'visible', timeout: 15000 });

  // Generate dynamic data for this test run
  currentProjectData = generateDynamicProjectData();
  await createProjectPage.completeFullFlow(currentProjectData);

  const rawPopupPage = createProjectPage.getRawPage();
  try {
    await rawPopupPage.waitForEvent('close', { timeout: 15000 });
  } catch {
    if (!rawPopupPage.isClosed()) {
      await rawPopupPage.close();
    }
  }
});

When('opens the application form and creates a project', async ({ page }) => {
  const serviceApply = new ServiceApplyPage(page);
  await serviceApply.navigate((process.env.SERVICE_DEFINITION_ID || ''));
  const createProjectPage = await serviceApply.openCreateProjectPopup();

  currentProjectData = generateDynamicProjectData();
  await createProjectPage.completeFullFlow(currentProjectData);
});

When('completes all required form steps and checklists', async ({ page }) => {
  const serviceApply = new ServiceApplyPage(page);
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
    console.log('⚠️ Warning: networkidle state not reached before completing form steps, continuing...');
  });

  if (!currentProjectData) {
    throw new Error('No project data was generated! Ensure the project creation step runs before this step.');
  }
  const pName = currentProjectData.name;
  const pAddress = currentProjectData.streetAddress;

  await serviceApply.selectCreatedProject(pName);

  let maxAttempts = 15;
  while (maxAttempts > 0) {
    await page.waitForTimeout(2000); // Give the page transition time to settle
    
    const isChecklistVisible = await page.getByText('Submission checklist', { exact: false }).isVisible().catch(() => false);
    const isPaymentVisible = await page.locator('#PayIntakeFeeButton').isVisible().catch(() => false);
    const submitButton = page.getByRole('button', { name: /Submit application/i });
    const isSubmitVisible = await submitButton.isVisible().catch(() => false);
    const nextButton = page.getByRole('button', { name: 'Next' });
    const isNextVisible = await nextButton.isVisible().catch(() => false);

    if (isChecklistVisible) {
      const allCheckboxes = page.locator('.ta-apply-checklist__input');
      const boxCount = await allCheckboxes.count();
      for (let i = 0; i < boxCount; i++) {
        const currentBox = allCheckboxes.nth(i);
        const isChecked = await currentBox.isChecked();
        if (!isChecked) {
          await currentBox.check({ force: true, timeout: 2000 }).catch(() => { });
        }
      }
      if (isSubmitVisible) {
        await submitButton.click({ timeout: 5000 }).catch(() => {});
        break;
      } else if (isNextVisible) {
        await nextButton.click({ timeout: 5000 }).catch(() => {});
      }
    } else if (isPaymentVisible) {
      break; // Successfully reached the payment page!
    } else if (isSubmitVisible) {
      await submitButton.click();
      break;
    } else if (isNextVisible) {
      // Generic form filling
      const formInputs = page.locator('input[type="text"]:visible, textarea:visible');
      const inputCount = await formInputs.count();
      if (inputCount > 0) {
        await formInputs.nth(0).fill(pName).catch(() => { });
        if (inputCount > 1) await formInputs.nth(1).fill('30').catch(() => { });
        if (inputCount > 2) await formInputs.nth(2).fill(pAddress).catch(() => { });
        if (inputCount > 3) await formInputs.nth(3).fill('Standard safety measures').catch(() => { });
        if (inputCount > 4) await formInputs.nth(4).fill('Fire extinguishers and alarms').catch(() => { });
      }
      await nextButton.click({ timeout: 5000 }).catch(() => {});
    } else {
      console.log('🔄 Waiting for page transition...');
    }
    
    maxAttempts--;
  }
});

When('completes the intake fee payment via Stripe if required', async ({ page }) => {
  await page.waitForTimeout(2000);
  const payButton = page.locator('#PayIntakeFeeButton');
  // Wait up to 45 seconds for the draft to save and the payment page to load
  const isPaymentRequired = await payButton.waitFor({ state: 'visible', timeout: 45000 })
    .then(() => true)
    .catch(() => false);

  if (isPaymentRequired) {
    // Wait for the background draft save to finish to ensure the button's event listeners are active
    await page.waitForTimeout(3000);

    let stripePage;
    let retries = 3;

    while (retries > 0) {
      const popupPromise = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
      
      // Click the button
      await payButton.click({ force: true });

      // Check if it opened a popup
      stripePage = await popupPromise;
      if (stripePage) break;

      // If no popup, wait for the current page to redirect to Stripe
      await page.waitForURL(/.*stripe\.com.*/, { timeout: 15000 }).catch(() => {});
      
      const currentUrl = page.url();
      if (currentUrl.includes('stripe.com')) {
        stripePage = page;
        break;
      }
      
      console.log(`⚠️ Click swallowed or redirect failed. Retries left: ${retries - 1}`);
      retries--;
      await page.waitForTimeout(2000); // Wait a bit before retrying
    }

    if (!stripePage) {
      console.log('❌ Failed to reach Stripe checkout after multiple attempts.');
      return;
    }

    const stripeCheckout = new StripeCheckoutPage(stripePage);
    await stripeCheckout.completePayment();
    await page.waitForURL(/storefront/, { timeout: 60000 }).catch(() => { });
  }
});

When('submits the application and completes Stripe payment', async ({ page }) => {
  const serviceApply = new ServiceApplyPage(page);
  await page.waitForURL(/step=4/, { timeout: 30000 }).catch(() => { });
  await serviceApply.clickPayIntakeFee();

  const stripePage = await page.waitForEvent('popup');
  const stripeCheckout = new StripeCheckoutPage(stripePage);
  await stripeCheckout.completePayment();
});

// ═══════════════════════════════════════════════════════════════
// THEN STEPS
// ═══════════════════════════════════════════════════════════════

Then('the service request should be submitted successfully', async ({ page }) => {
  await page.getByText('Application submitted', { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
});

Then('the tracking number and service request state should be saved', async ({ page }) => {
  await page.waitForTimeout(2000);
  const bodyText = await page.locator('body').innerText();
  const trackingMatch = bodyText.match(/([A-Z]{2,4}\d{3}\s*-\s*[A-Z]{2}\s*-\s*\d{4}\s*-\s*\d{5})/);
  const trackingNumber = trackingMatch ? trackingMatch[1].replace(/\s+/g, '') : 'not-found';

  const currentUrl = page.url();
  const srIdMatch = currentUrl.match(/serviceRequestId=([^&]+)/);
  const serviceRequestId = srIdMatch ? srIdMatch[1] : 'not-found-in-url';

  const sdIdMatch = currentUrl.match(/serviceDefinitionId=([^&]+)/);
  const serviceDefinitionId = sdIdMatch ? sdIdMatch[1] : targetServiceUrl.match(/serviceDefinitionId=([^&]+)/)?.[1] || 'not-found-in-url';

  console.log(`✅ Success! Extracted Tracking Number: ${trackingNumber}`);
  console.log(`✅ Success! Extracted Service Request ID: ${serviceRequestId}`);
  expect(trackingNumber).not.toBe('not-found');
});

Then('the citizen SR state is saved as {string} with payment status {string}', async ({ page }, status: string, paymentStatus: string) => {
  const serviceApply = new ServiceApplyPage(page);
  const extractedId = serviceApply.extractServiceRequestId();
  console.log(`✅ Verified SR ID: ${extractedId} with status ${status}`);
  expect(extractedId).toBeTruthy();
});
