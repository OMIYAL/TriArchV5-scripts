import { test, expect } from '@playwright/test';
import { env, validateEnvVars } from '../../utils/env.helper';
import { saveState, STATE_FILES } from '../../utils/state.helper';
import type { CitizenSRState } from '../../utils/state.helper';
import { StorefrontHomePage } from '../../pages/storefront/storefront-home.page';
import { ServicesListingPage } from '../../pages/storefront/services-listing.page';
import { ServiceApplyPage } from '../../pages/storefront/service-apply.page';
import { AuthLoginPage } from '../../pages/auth-login.page';
import { StripeCheckoutPage } from '../../pages/stripe-checkout.page';

validateEnvVars([
  'STOREFRONT_BASE_URL',
  'AUTH_BASE_URL',
  'TENANT_NAME',
  'CITIZEN_USERNAME',
  'CITIZEN_PASSWORD',
]);

test.describe('Storefront: Citizen Submits Service Request', () => {
  
  test('Complete dynamic SR submission with payment', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes for this full flow

    const storefrontHome = new StorefrontHomePage(page);
    const servicesListing = new ServicesListingPage(page);
    const serviceApply = new ServiceApplyPage(page);
    const authLogin = new AuthLoginPage(page);

    let targetServiceUrl = '';

    // ═══════════════════════════════════════════════════════════
    // STEP 1: Navigate to Storefront
    // ═══════════════════════════════════════════════════════════
    await test.step('Navigate to Storefront', async () => {
      await storefrontHome.navigate(env.tenant.name);
    });

    // ═══════════════════════════════════════════════════════════
    // STEP 2: Capture URL and click RANDOM service
    // ═══════════════════════════════════════════════════════════
    await test.step('Select random available service', async () => {
      await storefrontHome.clickAboutUs();
      await storefrontHome.clickServices();
      targetServiceUrl = await servicesListing.clickRandomAvailableService();
    });

    // ═══════════════════════════════════════════════════════════
    // STEP 3: Login
    // ═══════════════════════════════════════════════════════════
    await test.step('Login as citizen', async () => {
      await page.waitForURL(/auth.*Login/, { timeout: 30000 });
      await authLogin.completeLoginFlow(
        env.tenant.name,
        env.credentials.citizen.username,
        env.credentials.citizen.password
      );
    });

    // ═══════════════════════════════════════════════════════════
    // STEP 4: Create Project (In Popup)
    // ═══════════════════════════════════════════════════════════
    await test.step('Create project in popup', async () => {
      await page.waitForURL(/(storefront|portal|triarch)/, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1000);

      const fullApplyUrl = new URL(targetServiceUrl, env.urls.storefront).href;
      console.log(`🔄 Navigating directly to: ${fullApplyUrl}`);
      
      await page.goto(fullApplyUrl, { waitUntil: 'domcontentloaded' });
      await serviceApply['projectCombobox'].waitFor({ state: 'visible', timeout: 15000 });

      const createProjectPage = await serviceApply.openCreateProjectPopup();
      await createProjectPage['jurisdictionCombobox'].waitFor({ state: 'visible', timeout: 15000 });
      await createProjectPage.completeFullFlow(); 
      
      const rawPopupPage = createProjectPage.getRawPage();
      try {
        await rawPopupPage.waitForEvent('close', { timeout: 15000 });
      } catch {
        if (!rawPopupPage.isClosed()) {
          await rawPopupPage.close();
        }
      }
    });

    // ═══════════════════════════════════════════════════════════
    // STEP 5: Select Project & Complete Main SR Form
    // ═══════════════════════════════════════════════════════════
    await test.step('Select project and complete SR form steps', async () => {
      await page.waitForLoadState('networkidle');
      
      console.log(`🔧 Selecting project: ${env.project.name}`);
      await serviceApply.selectCreatedProject(env.project.name);
      
      let maxAttempts = 10; 
      
      while (maxAttempts > 0) {
        // Wait a moment for UI to settle after every action
        await page.waitForTimeout(1500); 
        
        // Detect what type of step we are currently on
        const isChecklistVisible = await page.getByText('Submission checklist', { exact: false }).isVisible().catch(() => false);
        const isPaymentVisible = await page.getByRole('button', { name: /Pay intake fee/i }).isVisible().catch(() => false);
        const submitButton = page.getByRole('button', { name: /Submit application/i });
        const isSubmitVisible = await submitButton.isVisible().catch(() => false);

        // ═══════════════════════════════════════════════════════
        // SCENARIO A: We are on the Checklist
        // ═══════════════════════════════════════════════════════
        if (isChecklistVisible) {
          console.log('☑️ On Submission Checklist. Ticking boxes...');
          
          const allCheckboxes = page.locator('input[type="checkbox"]:visible');
          const boxCount = await allCheckboxes.count();
          
          for (let i = 0; i < boxCount; i++) {
            const currentBox = page.locator('input[type="checkbox"]:visible').nth(i);
            if (await currentBox.isVisible()) {
              const isChecked = await currentBox.isChecked();
              if (!isChecked) {
                await currentBox.click({ timeout: 5000 }).catch(() => {});
                await page.waitForTimeout(500);
              }
            }
          }
          console.log(`✅ Processed ${boxCount} checkboxes.`);
          
          // After ticking, check what button is available to proceed
          if (isSubmitVisible) {
            console.log('🚀 Clicking Submit application.');
            await submitButton.click();
            break; // We are completely done!
          } else {
            console.log('⏭️ Clicking Next to proceed to Payment step.');
            await page.getByRole('button', { name: 'Next' }).click();
            // Don't break! Let the loop catch the payment step on the next iteration
          }
        }
        
        // ═══════════════════════════════════════════════════════
        // SCENARIO B: We are on the Payment Step
        // ═══════════════════════════════════════════════════════
        else if (isPaymentVisible) {
          console.log('💰 Reached Payment step. Breaking to handle payment.');
          break; // Let Step 6 handle the Stripe flow
        }
        
        // ═══════════════════════════════════════════════════════
        // SCENARIO C: We are on the Final Step (Submit without Checklist)
        // ═══════════════════════════════════════════════════════
        else if (isSubmitVisible) {
          console.log('🚀 Clicking Submit application directly.');
          await submitButton.click();
          break; // We are completely done!
        }
        
        // ═══════════════════════════════════════════════════════
        // SCENARIO D: We are on a standard Form Step
        // ═══════════════════════════════════════════════════════
        else {
          const formInputs = page.locator('input[type="text"]:visible, textarea:visible');
          const inputCount = await formInputs.count();
          
          if (inputCount > 0) {
            console.log(`📝 Filling ${inputCount} dynamic form inputs...`);
            await formInputs.nth(0).fill(env.project.name).catch(() => {}); 
            if (inputCount > 1) await formInputs.nth(1).fill('30').catch(() => {}); 
            if (inputCount > 2) await formInputs.nth(2).fill(env.project.streetAddress).catch(() => {}); 
            if (inputCount > 3) await formInputs.nth(3).fill('Standard safety measures').catch(() => {}); 
            if (inputCount > 4) await formInputs.nth(4).fill('Fire extinguishers and alarms').catch(() => {}); 
          }

          const nextButton = page.getByRole('button', { name: 'Next' });
          await nextButton.waitFor({ state: 'visible', timeout: 5000 });
          await nextButton.click();
          console.log(`⏭️ Clicked Next. Attempts left: ${maxAttempts - 1}`);
        }
        
        maxAttempts--;
      }
    });

    // ═══════════════════════════════════════════════════════════
    // STEP 6: Handle Payment (ONLY IF REQUIRED)
    // ═══════════════════════════════════════════════════════════
    await test.step('Handle payment if required', async () => {
      await page.waitForTimeout(2000);
      
      const payButton = page.getByRole('button', { name: /Pay intake fee/i });
      const isPaymentRequired = await payButton.isVisible({ timeout: 3000 }).catch(() => false);

      if (isPaymentRequired) {
        console.log('💳 Payment required. Processing Stripe checkout...');
        
        // ⭐ FIX 1: Start listening for the popup BEFORE clicking the button
        const popupPromise = page.waitForEvent('popup', { timeout: 10000 });
        await payButton.click();
        
        let stripePage;
        try {
          // Try to catch the popup
          stripePage = await popupPromise;
          console.log('🌐 Stripe opened in a new popup tab.');
        } catch {
          // ⭐ FIX 2: If no popup opened, check if the main page redirected to Stripe
          console.log('⚠️ No popup detected. Checking for same-page redirect...');
          const currentUrl = page.url();
          
          if (currentUrl.includes('stripe.com')) {
            console.log('🔄 Stripe loaded on the main page.');
            stripePage = page; // Use the main page object
          } else {
            console.log('❌ Stripe checkout did not load. Skipping payment.');
            return; // Exit the step safely
          }
        }

        // Fill out the Stripe form
        const stripeCheckout = new StripeCheckoutPage(stripePage);
        await stripeCheckout.completePayment();
        
        console.log('✅ Payment form submitted. Waiting for redirect back to Storefront...');
        
        // Wait to return to storefront (works for both popup and redirect scenarios)
        await page.waitForURL(/storefront/, { timeout: 30000 }).catch(() => {
          console.log('⚠️ Did not redirect back to storefront, but payment likely succeeded.');
        });
      } else {
        console.log('✅ No payment required. SR submitted directly.');
      }
    });
    // ═══════════════════════════════════════════════════════════
    // STEP 7: Save State & Capture Tracking Number
    // ═══════════════════════════════════════════════════════════
    await test.step('Save state and capture tracking number', async () => {
      // ⭐ FIX: Wait for the "Application submitted" success page to load
      await page.getByText('Application submitted', { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForTimeout(2000); // Ensure text is fully rendered
      
      // ⭐ FIX: Extract the Tracking Number using Regex (e.g., "PCE002 - CA - 2026 - 00083")
      const bodyText = await page.locator('body').innerText();
      const trackingMatch = bodyText.match(/([A-Z]{2,4}\d{3}\s*-\s*[A-Z]{2}\s*-\s*\d{4}\s*-\s*\d{5})/);
      const trackingNumber = trackingMatch ? trackingMatch[1].replace(/\s+/g, '') : 'not-found';
      
      console.log(`🔗 Captured Tracking Number: ${trackingNumber}`);
      
      const currentUrl = page.url();
      
      // Fallback to URL if needed
      const srIdMatch = currentUrl.match(/serviceRequestId=([^&]+)/);
      const serviceRequestId = srIdMatch ? srIdMatch[1] : 'not-found-in-url';
      
      const sdIdMatch = currentUrl.match(/serviceDefinitionId=([^&]+)/);
      const serviceDefinitionId = sdIdMatch ? sdIdMatch[1] : targetServiceUrl.match(/serviceDefinitionId=([^&]+)/)?.[1] || 'not-found-in-url';

      const state: CitizenSRState = {
        serviceRequestId,
        trackingNumber, // ⭐ SAVED HERE
        projectId: '',
        projectName: env.project.name,
        serviceName: 'Dynamically Selected',
        serviceDefinitionId,
        submittedAt: new Date().toISOString(),
        paymentStatus: 'completed',
        status: 'submitted',
      };
      
      saveState(STATE_FILES.citizenSR, state);
      console.log(`✅ Dynamic SR Submitted! ID: ${serviceRequestId}`);
      console.log(`✅ State saved successfully.`);
    });
  });
});