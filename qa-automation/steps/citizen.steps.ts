import { expect, type Page } from '@playwright/test';
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
import { waitForMimikCapture } from '../utils/mimik.helper';
import { guideClick } from '../utils/mimik-action.helper';

let targetServiceUrl = '';
let currentProjectData: DynamicProjectData | null = null;

/** Tick opacity-0 checklist inputs via their visible label rows. */
async function completeSubmissionChecklist(page: Page): Promise<void> {
  const list = page.locator('#SubmissionChecklistList');
  await list.waitFor({ state: 'visible' });

  if (!(await page.getByText(/\b0 of \d+ complete\b/i).isVisible().catch(() => false))) return;

  const items = list.locator('.ta-apply-checklist__item');
  for (let i = 0; i < (await items.count()); i++) {
    const item = items.nth(i);
    const input = item.locator('.ta-apply-checklist__input');
    if (await input.isChecked().catch(() => false)) continue;

    await guideClick(page, item.locator('label.ta-apply-checklist__row'));
    if (!(await input.isChecked().catch(() => false))) {
      await input.check({ force: true });
      await waitForMimikCapture(page);
    }
  }

  await page.getByText(/\b[1-9]\d* of \d+ complete\b/i).first().waitFor({ state: 'visible' });
}

Given('the citizen is on the Storefront home page', async ({ page }) => {
  await new StorefrontHomePage(page).navigate(process.env.TENANT_NAME || '');
});

Given('the citizen navigates to an available service', async ({ page }) => {
  const listing = new ServicesListingPage(page);
  await listing.openListing(process.env.TENANT_NAME || '');

  if (process.env.SERVICE_NAME) {
    console.log(`Selecting configured service: ${process.env.SERVICE_NAME}`);
    targetServiceUrl = await listing.navigateToService(process.env.SERVICE_NAME);
  } else {
    targetServiceUrl = await listing.clickRandomAvailableService();
  }
});

When('the citizen logs in with valid credentials', async ({ page }) => {
  const usernameBox = page.getByRole('textbox', { name: /Username/i });
  const needsLogin =
    /auth|Account\/Login|\/Login/i.test(page.url()) ||
    (await usernameBox.isVisible().catch(() => false));

  if (needsLogin) {
    await new AuthLoginPage(page).completeLoginFlow(
      process.env.TENANT_NAME || '',
      process.env.CITIZEN_USERNAME || '',
      process.env.CITIZEN_PASSWORD || '',
    );
  }

  if (!targetServiceUrl) return;

  const applyUrl = new URL(targetServiceUrl, process.env.STOREFRONT_BASE_URL || '');
  applyUrl.searchParams.set('__tenant', process.env.TENANT_NAME || '');
  await page.goto(applyUrl.href, { waitUntil: 'domcontentloaded' });

  if (/auth|Account\/Login|\/Login/i.test(page.url()) || (await usernameBox.isVisible().catch(() => false))) {
    await new AuthLoginPage(page).completeLoginFlow(
      process.env.TENANT_NAME || '',
      process.env.CITIZEN_USERNAME || '',
      process.env.CITIZEN_PASSWORD || '',
    );
    await page.goto(applyUrl.href, { waitUntil: 'domcontentloaded' });
  }

  await page
    .locator('a[href*="PermitProjects/Create"], #ProjectId, [role="combobox"]')
    .first()
    .waitFor({ state: 'visible' });
});

When('creates a new project for the service application', async ({ page }) => {
  const serviceApply = new ServiceApplyPage(page);

  if (!/PermitProjects\/Create/i.test(page.url())) {
    await serviceApply.waitForProjectCombobox();
  }

  const createProjectPage = await serviceApply.openCreateProjectPopup();
  currentProjectData = generateDynamicProjectData();
  await createProjectPage.completeFullFlow(currentProjectData);

  const rawCreatePage = createProjectPage.getRawPage();
  await rawCreatePage.waitForURL(/projectId=|services\/Apply/i).catch(() => {});

  const projectId =
    createProjectPage.getCreatedProjectId() ||
    new URL(rawCreatePage.isClosed() ? page.url() : rawCreatePage.url()).searchParams.get('projectId') ||
    new URL(page.url()).searchParams.get('projectId') ||
    '';

  if (!rawCreatePage.isClosed() && rawCreatePage !== page) {
    await rawCreatePage.close();
  }

  if (!targetServiceUrl) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    return;
  }

  const applyUrl = new URL(targetServiceUrl, process.env.STOREFRONT_BASE_URL || '');
  applyUrl.searchParams.set('__tenant', process.env.TENANT_NAME || '');
  if (projectId) {
    applyUrl.searchParams.set('projectId', projectId);
    console.log(`Returning to Apply with projectId=${projectId}`);
  }
  await page.goto(applyUrl.href, { waitUntil: 'domcontentloaded' });
});

When('completes all required form steps and checklists', async ({ page }) => {
  if (!currentProjectData) {
    throw new Error('No project data was generated. Ensure the project creation step ran first.');
  }

  await new ServiceApplyPage(page).selectCreatedProject(currentProjectData.name);

  const payButton = page.locator('#PayIntakeFeeButton');
  const submitButton = page.getByRole('button', { name: /Submit application/i });
  const nextButton = page
    .getByRole('button', { name: 'Next', exact: true })
    .and(page.locator(':visible'))
    .last();

  let serviceDocUploaded = false;
  let uploadFailures = 0;

  for (let attempt = 0; attempt < 20; attempt++) {
    await closeSelect2Dropdown(page);

    if (await page.getByText('Application submitted', { exact: false }).isVisible().catch(() => false)) {
      return;
    }

    if (
      (await payButton.isVisible().catch(() => false)) ||
      (await page.getByRole('heading', { name: /intake fee/i }).isVisible().catch(() => false))
    ) {
      console.log('Intake fee step reached.');
      return;
    }

    if (await page.getByText('Submission checklist', { exact: false }).isVisible().catch(() => false)) {
      await completeSubmissionChecklist(page);
      console.log('Submission checklist marked complete.');
      if (await nextButton.isVisible().catch(() => false)) {
        await guideClick(page, nextButton, { force: true });
        continue;
      }
      if (await submitButton.isVisible().catch(() => false)) {
        await guideClick(page, submitButton, { force: true });
        return;
      }
      continue;
    }

    const emptyFields = page.locator(
      'input:visible:not([readonly]):not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea:visible:not([readonly])',
    );
    for (let i = 0; i < (await emptyFields.count()); i++) {
      if (!(await emptyFields.nth(i).inputValue()).trim()) {
        await fillApplicantFields(page, currentProjectData);
        await closeSelect2Dropdown(page);
        break;
      }
    }

    if (!serviceDocUploaded) {
      const uploadTrigger = page
        .locator('#OpenSupportingDocumentButton')
        .or(page.getByRole('button', { name: /Supporting documents|Upload document/i }))
        .first();

      if (await uploadTrigger.isVisible().catch(() => false)) {
        const uploaded = await new DocumentUploadComponent(page).uploadIfVisible(
          undefined,
          undefined,
          'service',
        );
        if (uploaded) {
          serviceDocUploaded = true;
        } else if (++uploadFailures >= 3) {
          console.log('Skipping optional supporting document upload after 3 failures.');
          serviceDocUploaded = true;
        }
      }
    }

    const openOffcanvas = page.locator('.offcanvas.show');
    if (await openOffcanvas.isVisible().catch(() => false)) {
      const cancel = openOffcanvas.getByRole('button', { name: /Cancel|Close/i }).first();
      if (await cancel.isVisible().catch(() => false)) {
        await guideClick(page, cancel, { force: true }).catch(() => {});
      }
      await openOffcanvas.waitFor({ state: 'hidden' }).catch(() => {});
    }

    if (await nextButton.isVisible().catch(() => false)) {
      await guideClick(page, nextButton, { force: true });
    } else if (await submitButton.isVisible().catch(() => false)) {
      await guideClick(page, submitButton, { force: true });
      return;
    }
  }

  throw new Error('Form steps finished without reaching intake fee / payment.');
});

When('completes the intake fee payment via Stripe if required', async ({ page }) => {
  const payButton = page.locator('#PayIntakeFeeButton');
  if (!(await payButton.isVisible().catch(() => false))) {
    console.log('No intake fee button found — skipping Stripe payment.');
    return;
  }

  await new ServiceApplyPage(page).payIntakeFeeAndOpenStripe();
  await new StripeCheckoutPage(page).completePayment();
  await page.waitForURL((url) => /storefront/i.test(url.hostname)).catch(() => {});
});

Then('the service request should be submitted successfully', async ({ page }) => {
  await page.getByText('Application submitted', { exact: false }).waitFor({ state: 'visible' });
});

Then('the tracking number and service request state should be saved', async ({ page }) => {
  const bodyText = await page.locator('body').innerText();
  const trackingMatch = bodyText.match(/([A-Z]{2,4}\d{3}\s*-\s*[A-Z]{2}\s*-\s*\d{4}\s*-\s*\d{5})/);
  const trackingNumber = trackingMatch ? trackingMatch[1].replace(/\s+/g, '') : 'not-found';
  console.log(`Tracking Number: ${trackingNumber}`);
  expect(trackingNumber).not.toBe('not-found');
});
