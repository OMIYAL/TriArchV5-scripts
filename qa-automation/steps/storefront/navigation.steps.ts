import { Given, When } from '../support/fixtures';
import { env } from '../../utils/env.helper';

Given('the citizen is on the Storefront home page', async ({ storefrontHomePage }) => {
  await storefrontHomePage.navigate(env.tenant.name);
});

When('the citizen opens the services listing', async ({ storefrontHomePage }) => {
  await storefrontHomePage.clickAboutUs();
  await storefrontHomePage.clickServices();
});

When('an available service is listed on the Storefront', async ({ page, servicesListingPage }) => {
  await page.getByRole('link', { name: /^Request .+ Review$/ }).first().waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  await servicesListingPage.expandMoreServicesIfNeeded();
});

When('the citizen navigates to the available service', async ({ servicesListingPage, scenarioCtx }) => {
  scenarioCtx.targetServiceUrl = await servicesListingPage.clickRandomAvailableService();
});

