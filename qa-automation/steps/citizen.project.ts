import { createBdd } from 'playwright-bdd';
import { CreateProjectPage } from '../pages/storefront/create-project.page';
import { StorefrontHomePage } from '../pages/storefront/storefront-home.page';
import { generateDynamicProjectData } from '../utils/data-generator.helper';

const { When, Then } = createBdd();

When('the citizen navigates to My Projects', async ({ page }) => {
  const home = new StorefrontHomePage(page);
  await home.clickProjectNav();
  await page.waitForURL(/PermitProjects/i, { timeout: 15000 });
});

When('creates a new permit project', async ({ page }) => {
  const newPermitProjectLink = page.getByRole('link', { name: /New Permit Project|Create a new project/i }).first();
  await newPermitProjectLink.waitFor({ state: 'visible', timeout: 15000 });
  await newPermitProjectLink.click();

  const createPage = new CreateProjectPage(page);
  const currentProjectData = generateDynamicProjectData();
  await createPage.completeFullFlow(currentProjectData);
});

Then('the new project should be created successfully', async ({ page }) => {
  await page.getByRole('heading', { name: /Project|Permit Project|My Projects/i }).first().waitFor({ state: 'visible', timeout: 15000 });
});
