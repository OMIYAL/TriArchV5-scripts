import { test, expect } from '@playwright/test';
import { env, validateEnvVars } from '../../utils/env.helper';
import { 
  clearAllState, 
  loadState, 
  saveState, 
  STATE_FILES 
} from '../../utils/state.helper';
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
  'SERVICE_DEFINITION_ID',
  'SERVICE_NAME',
]);

test.describe('E2E: Complete Citizen Flow', () => {
  test.beforeAll(() => {
    clearAllState();
  });

  test('Citizen submits SR and pays', async ({ page }) => {
    const storefrontHome = new StorefrontHomePage(page);
    const servicesListing = new ServicesListingPage(page);
    const serviceApply = new ServiceApplyPage(page);
    const authLogin = new AuthLoginPage(page);

    // Navigate and login
    await storefrontHome.navigate(env.tenant.name);
    await storefrontHome.clickAboutUs();
    await storefrontHome.clickServices();
    await servicesListing.navigateToService(env.service.name);
    
    await page.waitForURL(/auth.*Login/, { timeout: 30000 });
    await authLogin.completeLoginFlow(
      env.tenant.name,
      env.credentials.citizen.username,
      env.credentials.citizen.password
    );

    // Apply and pay
    await serviceApply.navigate(env.service.definitionId);
    const createProjectPage = await serviceApply.openCreateProjectPopup();
    await createProjectPage.completeFullFlow();
    
    await page.waitForURL(/step=4/, { timeout: 30000 }).catch(() => {});
    await serviceApply.clickPayIntakeFee();
    
    const stripePage = await page.waitForEvent('popup');
    const stripeCheckout = new StripeCheckoutPage(stripePage);
    await stripeCheckout.completePayment();

    // Save state
    const state: CitizenSRState = {
      serviceRequestId: serviceApply.extractServiceRequestId() || '',
      projectId: '',
      projectName: env.project.name,
      serviceName: env.service.name,
      serviceDefinitionId: env.service.definitionId,
      submittedAt: new Date().toISOString(),
      paymentStatus: 'completed',
      status: 'submitted',
    };
    saveState(STATE_FILES.citizenSR, state);

    // Verify state was saved
    const loadedState = loadState<CitizenSRState>(STATE_FILES.citizenSR);
    expect(loadedState).not.toBeNull();
    expect(loadedState?.serviceRequestId).toBe(state.serviceRequestId);
  });
});