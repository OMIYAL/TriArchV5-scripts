import { createBdd, test as base } from 'playwright-bdd';
import { validateEnvVars } from '../../utils/env.helper';
import { StorefrontHomePage } from '../../pages/storefront/storefront-home.page';
import { ServicesListingPage } from '../../pages/storefront/services-listing.page';
import { ServiceApplyPage } from '../../pages/storefront/service-apply.page';
import { AuthLoginPage } from '../../pages/auth-login.page';

export type ScenarioContext = {
  targetServiceUrl: string;
  trackingNumber: string;
  serviceRequestId: string;
};

export const test = base.extend<{
  storefrontHomePage: StorefrontHomePage;
  servicesListingPage: ServicesListingPage;
  serviceApplyPage: ServiceApplyPage;
  authLoginPage: AuthLoginPage;
  scenarioCtx: ScenarioContext;
}>({
  storefrontHomePage: async ({ page }, use) => use(new StorefrontHomePage(page)),
  servicesListingPage: async ({ page }, use) => use(new ServicesListingPage(page)),
  serviceApplyPage: async ({ page }, use) => use(new ServiceApplyPage(page)),
  authLoginPage: async ({ page }, use) => use(new AuthLoginPage(page)),
  scenarioCtx: async ({}, use) =>
    use({
      targetServiceUrl: '',
      trackingNumber: '',
      serviceRequestId: '',
    }),
});

export const { Given, When, Then, Before } = createBdd(test);

Before({ tags: '@citizen' }, async () => {
  validateEnvVars([
    'STOREFRONT_BASE_URL',
    'AUTH_BASE_URL',
    'TENANT_NAME',
    'CITIZEN_USERNAME',
    'CITIZEN_PASSWORD',
  ]);
});

