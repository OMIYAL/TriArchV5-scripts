import { test as base, createBdd } from 'playwright-bdd';
import { StorefrontHomePage } from '../pages/storefront/storefront-home.page';
import { ServicesListingPage } from '../pages/storefront/services-listing.page';
import { ServiceApplyPage } from '../pages/storefront/service-apply.page';
import { AuthLoginPage } from '../pages/auth-login.page';

type CustomFixtures = {
  storefrontHome: StorefrontHomePage;
  servicesListing: ServicesListingPage;
  serviceApply: ServiceApplyPage;
  authLogin: AuthLoginPage;
};

export const test = base.extend<CustomFixtures>({
  storefrontHome: async ({ page }, use) => {
    await use(new StorefrontHomePage(page));
  },
  servicesListing: async ({ page }, use) => {
    await use(new ServicesListingPage(page));
  },
  serviceApply: async ({ page }, use) => {
    await use(new ServiceApplyPage(page));
  },
  authLogin: async ({ page }, use) => {
    await use(new AuthLoginPage(page));
  },
});

export const { Given, When, Then } = createBdd(test);
