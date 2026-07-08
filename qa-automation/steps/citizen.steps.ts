import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { StorefrontHomePage } from '../pages/storefront/storefront-home.page';
import { ServicesListingPage } from '../pages/storefront/services-listing.page';
import { ServiceApplyPage } from '../pages/storefront/service-apply.page';
import { DocumentUploadComponent } from '../pages/storefront/document-upload.component';
import { AuthLoginPage } from '../pages/auth-login.page';
import { StripeCheckoutPage } from '../pages/stripe-checkout.page';
import { generateDynamicProjectData, DynamicProjectData } from '../utils/data-generator.helper';
import { fillApplicantFields } from '../utils/form-fill.helper';
import { closeSelect2Dropdown, selectFromSelect2Combobox } from '../utils/select2.helper';
import { env } from '../utils/env.helper';

const { Given, When, Then } = createBdd();

let targetServiceUrl = '';
let lastApplyUrl = '';
let currentProjectData: DynamicProjectData | null = null;

// ─────────────────────────────────────────────
// GIVEN
// ─────────────────────────────────────────────

Given('the citizen is on the Storefront home page', async ({ page }) => {
  const storefrontHome = new StorefrontHomePage(page);
  await storefrontHome.navigate(env.tenant.name);
});

Given('the citizen navigates to an available service', async ({ page }) => {
  const servicesListing = new ServicesListingPage(page);
  await servicesListing.openListing(env.tenant.name);

  if (env.service.name) {
    console.log(`Selecting configured service: ${env.service.name}`);
    targetServiceUrl = await servicesListing.navigateToService(env.service.name);
  } else {
    targetServiceUrl = await servicesListing.clickRandomAvailableService();
  }
});

// ─────────────────────────────────────────────
// WHEN
// ─────────────────────────────────────────────

function isOnAuthLoginPage(url: string): boolean {
  return /Account\/Login|auth.*Login/i.test(url);
}

function isOnApplyPage(url: string): boolean {
  return /\/services\/Apply/i.test(url);
}

function buildApplyUrl(servicePath: string): string {
  const applyUrl = new URL(servicePath, env.urls.storefront);
  if (!applyUrl.searchParams.has('__tenant') && env.tenant.name) {
    applyUrl.searchParams.set('__tenant', env.tenant.name);
  }
  return applyUrl.href;
}

function withTenantParam(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('__tenant') && env.tenant.name) {
      parsed.searchParams.set('__tenant', env.tenant.name);
    }
    return parsed.href;
  } catch {
    return url;
  }
}

async function ensureApplyPageTenant(page: import('@playwright/test').Page): Promise<void> {
  const url = page.url();
  if (!isOnApplyPage(url)) return;

  const parsed = new URL(url);
  if (parsed.searchParams.has('__tenant') || !env.tenant.name) return;

  parsed.searchParams.set('__tenant', env.tenant.name);
  console.log('Apply URL missing __tenant — restoring tenant context.');
  await page.goto(parsed.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
}

function restoreApplyUrlParams(url: string): string {
  try {
    const parsed = new URL(url, env.urls.storefront);
    parsed.searchParams.delete('handler');

    if (lastApplyUrl) {
      const last = new URL(lastApplyUrl, env.urls.storefront);
      for (const key of ['serviceDefinitionId', 'projectId', '__tenant']) {
        if (!parsed.searchParams.has(key) && last.searchParams.has(key)) {
          parsed.searchParams.set(key, last.searchParams.get(key)!);
        }
      }
    }

    if (!parsed.searchParams.has('serviceDefinitionId') && targetServiceUrl) {
      const serviceId = new URL(targetServiceUrl, env.urls.storefront).searchParams.get('serviceDefinitionId');
      if (serviceId) parsed.searchParams.set('serviceDefinitionId', serviceId);
    }

    return withTenantParam(parsed.href);
  } catch {
    return lastApplyUrl || withTenantParam(url);
  }
}

function normalizeApplyUrl(url: string): string {
  try {
    const parsed = new URL(url, env.urls.storefront);
    parsed.searchParams.delete('handler');
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url;
  }
}

function needsApplyPageRecovery(url: string): boolean {
  if (!isOnApplyPage(url)) return true;
  if (!/handler=SaveDraft/i.test(url)) return false;

  try {
    const parsed = new URL(url, env.urls.storefront);
    return !parsed.searchParams.has('serviceDefinitionId') || !parsed.searchParams.has('projectId');
  } catch {
    return true;
  }
}

async function assertApplyPageAccessible(page: import('@playwright/test').Page): Promise<void> {
  if (!await page.getByText('403').isVisible({ timeout: 500 }).catch(() => false)) return;

  console.log('403 Forbidden detected — attempting browser back navigation.');
  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await dismissValidationToasts(page);

  if (!await page.getByText('403').isVisible({ timeout: 500 }).catch(() => false)) return;

  const msg = await page.locator('h5').first().innerText().catch(() => 'Forbidden');
  throw new Error(`Apply page blocked (${msg}). The form step may have been submitted twice.`);
}

async function dismissValidationToasts(page: import('@playwright/test').Page): Promise<void> {
  const toastMessages = page.getByText(/select jurisdiction|jurisdiction not selected/i);
  for (let i = 0; i < 6; i++) {
    if (!await toastMessages.first().isVisible({ timeout: 300 }).catch(() => false)) break;
    const closeBtn = page.locator('.toast button, [class*="toast"] button, [role="alert"] button').first();
    if (await closeBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      await closeBtn.click({ force: true }).catch(() => {});
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.waitForTimeout(200);
  }
  await closeSelect2Dropdown(page);
}

async function ensureApplyJurisdiction(
  page: import('@playwright/test').Page,
  projectData: DynamicProjectData,
): Promise<void> {
  if (!projectData.jurisdiction) return;

  const jurisdictionBox = page.getByRole('textbox', { name: /jurisdiction/i });
  if (await jurisdictionBox.isVisible({ timeout: 500 }).catch(() => false)) {
    const current = (await jurisdictionBox.inputValue().catch(() => '') ?? '').trim();
    if (current !== projectData.jurisdiction) {
      console.log(`Correcting jurisdiction from "${current}" to "${projectData.jurisdiction}".`);
      await jurisdictionBox.fill(projectData.jurisdiction);
    }
  }

  const jurisdictionCombobox = page
    .locator('[role="combobox"]:visible')
    .filter({ hasText: /jurisdiction|select jurisdiction|search jurisdiction/i })
    .first();

  if (await jurisdictionCombobox.isVisible({ timeout: 500 }).catch(() => false)) {
    const comboText = (await jurisdictionCombobox.innerText().catch(() => '') ?? '').trim();
    if (/select|search jurisdiction/i.test(comboText) || comboText !== projectData.jurisdiction) {
      await selectFromSelect2Combobox(page, jurisdictionCombobox, {
        preferredName: projectData.jurisdiction,
        skipIfFilled: /^$/,
      }).catch(() => closeSelect2Dropdown(page));
    }
  }

  await closeSelect2Dropdown(page);
}

async function isApplyFormInteractive(page: import('@playwright/test').Page): Promise<boolean> {
  return page
    .getByRole('button', { name: 'Next', exact: true })
    .or(page.locator('#PayIntakeFeeButton'))
    .or(page.getByText('Submission checklist', { exact: false }))
    .or(page.locator('#OpenSupportingDocumentButton'))
    .or(page.getByRole('button', { name: /Submit application/i }))
    .first()
    .isVisible({ timeout: 1500 })
    .catch(() => false);
}

async function fixApplyUrlInPlace(page: import('@playwright/test').Page, destination: string): Promise<void> {
  await page.evaluate((href) => {
    window.history.replaceState(null, '', href);
  }, destination);
  lastApplyUrl = destination;
}

async function waitForSaveDraftToSettle(page: import('@playwright/test').Page): Promise<boolean> {
  return page
    .waitForURL(
      (u) => {
        const href = typeof u === 'string' ? u : u.href;
        return (
          isOnApplyPage(href) &&
          href.includes('serviceDefinitionId') &&
          href.includes('projectId') &&
          !/handler=SaveDraft/i.test(href)
        );
      },
      { timeout: 12000 },
    )
    .then(() => true)
    .catch(() => false);
}

async function getApplyStepFingerprint(page: import('@playwright/test').Page): Promise<string> {
  const nav = page.getByRole('navigation', { name: 'Service application steps' });
  const stepLabel = await nav.locator('[aria-current="step"], [aria-current="page"], .active, .current').first()
    .innerText()
    .catch(() => '');

  const headings = await page.locator('main h1:visible, main h2:visible, main h3:visible').allInnerTexts().catch(() => []);
  return `${stepLabel}::${headings.join('|')}`;
}

async function hasEmptyVisibleFields(page: import('@playwright/test').Page): Promise<boolean> {
  const fields = page.locator(
    'input:visible:not([readonly]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea:visible:not([readonly])',
  );
  const count = await fields.count();
  for (let i = 0; i < count; i++) {
    const value = (await fields.nth(i).inputValue().catch(() => '') ?? '').trim();
    if (!value) return true;
  }
  return false;
}

async function clickNextAndAdvance(
  page: import('@playwright/test').Page,
  nextButton: import('@playwright/test').Locator,
  stepFingerprint: string,
): Promise<void> {
  await nextButton.scrollIntoViewIfNeeded();
  await nextButton.click({ force: true });

  await page.waitForFunction(
    (previous) => {
      const nav = document.querySelector('[aria-label="Service application steps"]');
      const active = nav?.querySelector('[aria-current="step"], [aria-current="page"], .active, .current');
      const label = active?.textContent?.trim() ?? '';
      const headings = Array.from(document.querySelectorAll('main h1, main h2, main h3'))
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => el.textContent?.trim() ?? '')
        .join('|');
      const fingerprint = `${label}::${headings}`;
      return fingerprint !== previous;
    },
    stepFingerprint,
    { timeout: 10000 },
  ).catch(() => {});

  await waitForSaveDraftToSettle(page);
  if (/handler=SaveDraft/i.test(page.url())) {
    await returnToApplyPageIfNeeded(page);
  }
}

async function returnToApplyPageIfNeeded(page: import('@playwright/test').Page): Promise<void> {
  await assertApplyPageAccessible(page);

  const url = page.url();
  if (!needsApplyPageRecovery(url)) {
    if (/handler=SaveDraft/i.test(url)) {
      const destination = restoreApplyUrlParams(url);
      if (normalizeApplyUrl(url) !== normalizeApplyUrl(destination)) {
        console.log(`Stripping SaveDraft handler from apply URL.`);
        await fixApplyUrlInPlace(page, destination);
      }
    }
    return;
  }

  const destination = restoreApplyUrlParams(isOnApplyPage(url) ? url : (lastApplyUrl || buildApplyUrl(targetServiceUrl)));
  if (!destination) return;

  if (isOnApplyPage(url)) {
    console.log(`SaveDraft stripped apply params (was: ${url}) — waiting for redirect.`);
    if (await waitForSaveDraftToSettle(page)) {
      lastApplyUrl = page.url();
      return;
    }

    if (await isApplyFormInteractive(page)) {
      console.log(`Apply form still interactive — restoring URL without reload.`);
      await fixApplyUrlInPlace(page, destination);
      return;
    }
  }

  const normalizedCurrent = normalizeApplyUrl(url);
  const normalizedDestination = normalizeApplyUrl(destination);
  if (normalizedCurrent === normalizedDestination) return;

  console.log(`Recovering apply page (was: ${url}) -> ${destination}`);
  await page.goto(destination, { waitUntil: 'domcontentloaded', timeout: 20000 });
  lastApplyUrl = page.url();
  await page.waitForTimeout(1000);
  await assertApplyPageAccessible(page);
}

async function waitForPaymentStep(page: import('@playwright/test').Page): Promise<boolean> {
  const payButton = page.locator('#PayIntakeFeeButton');

  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

  for (let attempt = 0; attempt < 25; attempt++) {
    const url = page.url();

    if (/Account\/Login|auth.*Login/i.test(url)) {
      throw new Error('Session lost after submit — landed on login page. Ensure __tenant is set on apply URL.');
    }

    if (needsApplyPageRecovery(url)) {
      await returnToApplyPageIfNeeded(page);
      await page.waitForTimeout(1000);
      continue;
    }

    if (await payButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log('Intake fee step reached — handing off to payment step.');
      return true;
    }

    if (await page.getByText(/Amount due|Intake fee/i).isVisible({ timeout: 500 }).catch(() => false)) {
      console.log('Intake fee step detected by page text.');
      return true;
    }

    await page.waitForTimeout(1500);
  }

  return false;
}

When('the citizen logs in with valid credentials', async ({ page }) => {
  if (page.isClosed()) {
    throw new Error('Browser page was closed before login — keep the headed browser window open during the test.');
  }

  const currentUrl = page.url();
  if (isOnApplyPage(currentUrl)) {
    console.log('Already on service apply page — skipping login.');
    return;
  }

  if (!isOnAuthLoginPage(currentUrl)) {
    await page.waitForURL(/services\/Apply|Account\/Login|auth.*Login/i, { timeout: 60000 });
  }

  if (isOnApplyPage(page.url())) {
    console.log('Redirected to apply page without login — existing session detected.');
    return;
  }

  const authLogin = new AuthLoginPage(page);
  await authLogin.completeLoginFlow(
    env.tenant.name,
    env.credentials.citizen.username,
    env.credentials.citizen.password,
  );

  await page.waitForURL(/storefront/i, { timeout: 90000 });

  if (!isOnApplyPage(page.url()) && targetServiceUrl) {
    console.log(`Post-login redirect landed on ${page.url()} — navigating to apply page.`);
    lastApplyUrl = buildApplyUrl(targetServiceUrl);
    await page.goto(lastApplyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
});

When('creates a new project for the service application', async ({ page }) => {
  const serviceApply = new ServiceApplyPage(page);

  if (!isOnApplyPage(page.url()) && targetServiceUrl) {
    console.log(`Not on apply page (${page.url()}) — navigating directly.`);
    await page.goto(buildApplyUrl(targetServiceUrl), { waitUntil: 'domcontentloaded', timeout: 30000 });
  } else {
    await page.waitForURL(/storefront.*\/services\/Apply/i, { timeout: 30000 }).catch(() => {});
  }

  await serviceApply.waitForProjectCombobox();
  const createProjectPage = await serviceApply.openCreateProjectPopup();

  currentProjectData = generateDynamicProjectData();
  await createProjectPage.completeFullFlow(currentProjectData);

  const rawPopupPage = createProjectPage.getRawPage();
  await rawPopupPage.waitForURL(/projectId=|services\/Apply/i, { timeout: 60000 }).catch(() => {});

  const popupUrl = rawPopupPage.isClosed() ? '' : rawPopupPage.url();
  if (!rawPopupPage.isClosed()) {
    await rawPopupPage.close();
  }

  if (popupUrl.includes('/services/Apply') && popupUrl.includes('projectId=')) {
    const normalizedApplyUrl = withTenantParam(popupUrl);
    lastApplyUrl = normalizedApplyUrl;
    console.log(`Navigating apply page to popup result: ${normalizedApplyUrl}`);
    await page.goto(normalizedApplyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } else {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ensureApplyPageTenant(page);
    lastApplyUrl = page.url();
  }

  await page.waitForTimeout(1000);
});

When('completes all required form steps and checklists', async ({ page }) => {
  if (!currentProjectData) {
    throw new Error('No project data was generated. Ensure the project creation step ran first.');
  }

  await ensureApplyPageTenant(page);

  const serviceApply = new ServiceApplyPage(page);
  await serviceApply.selectCreatedProject(currentProjectData.name);
  await ensureApplyPageTenant(page);

  const payButton = page.locator('#PayIntakeFeeButton');
  const submitButton = page.getByRole('button', { name: /Submit application/i });
  const nextButton = page.getByRole('button', { name: 'Next', exact: true }).and(page.locator(':visible')).last();
  let serviceDocUploaded = false;
  let lastNextFingerprint = '';

  const readStepState = async () => ({
    isPaymentVisible: await payButton.isVisible().catch(() => false)
      || await page.getByRole('heading', { name: /intake fee/i }).isVisible().catch(() => false),
    isChecklistVisible: await page.getByText('Submission checklist', { exact: false }).isVisible().catch(() => false),
    isSubmitVisible: await submitButton.isVisible().catch(() => false),
    isNextVisible: await nextButton.isVisible().catch(() => false),
  });

  let stuckOnSameStepCount = 0;

  for (let attempt = 0; attempt < 20; attempt++) {
    await page.waitForTimeout(1000);
    await closeSelect2Dropdown(page);
    await dismissValidationToasts(page);

    if (needsApplyPageRecovery(page.url()) || /handler=SaveDraft/i.test(page.url())) {
      await returnToApplyPageIfNeeded(page);
    }

    let step = await readStepState();

    if (step.isPaymentVisible) {
      console.log('Intake fee step reached — handing off to payment step.');
      return;
    }

    if (step.isChecklistVisible) {
      await closeSelect2Dropdown(page);

      const checklistInputs = page.locator('.ta-apply-checklist__input');
      const boxCount = await checklistInputs.count();
      for (let i = 0; i < boxCount; i++) {
        const box = checklistInputs.nth(i);
        if (!await box.isChecked()) {
          await box.check({ force: true, timeout: 3000 }).catch(() => {});
        }
      }

      if (step.isNextVisible) {
        console.log('Checklist complete — clicking Next to reach intake fee step.');
        await closeSelect2Dropdown(page);
        await nextButton.click({ force: true });
        await waitForSaveDraftToSettle(page);
        if (/handler=SaveDraft/i.test(page.url())) {
          await returnToApplyPageIfNeeded(page);
        }
        const reachedPayment = await waitForPaymentStep(page);
        if (reachedPayment) return;
        continue;
      }

      if (step.isSubmitVisible) {
        console.log('Checklist complete — submitting application to reach payment step.');
        await submitButton.click({ force: true });
        const reachedPayment = await waitForPaymentStep(page);
        if (!reachedPayment) {
          throw new Error('Payment step (#PayIntakeFeeButton) not reached after checklist submit.');
        }
        return;
      }
      continue;
    }

    if (!step.isChecklistVisible && await hasEmptyVisibleFields(page)) {
      await fillApplicantFields(page, currentProjectData);
      await closeSelect2Dropdown(page);
    }

    if (!serviceDocUploaded) {
      const uploaded = await new DocumentUploadComponent(page).uploadIfVisible(undefined, undefined, 'service');
      if (uploaded) {
        serviceDocUploaded = true;
        await waitForSaveDraftToSettle(page);
        if (needsApplyPageRecovery(page.url()) || /handler=SaveDraft/i.test(page.url())) {
          await returnToApplyPageIfNeeded(page);
        }
        step = await readStepState();
      }
    }

    if (await page.getByRole('heading', { name: 'Error' }).isVisible({ timeout: 500 }).catch(() => false)) {
      const msg = await page.locator('h5').first().innerText().catch(() => 'Unknown error');
      throw new Error(`Service application error: ${msg}`);
    }

    if (step.isNextVisible) {
      const stepFingerprint = await getApplyStepFingerprint(page);

      if (stepFingerprint && stepFingerprint === lastNextFingerprint) {
        stuckOnSameStepCount++;
        if (stuckOnSameStepCount >= 3) {
          console.log('Step transition stalled — resetting and re-validating jurisdiction.');
          lastNextFingerprint = '';
          stuckOnSameStepCount = 0;
          await ensureApplyJurisdiction(page, currentProjectData);
          await dismissValidationToasts(page);
        } else {
          console.log('Next already clicked on this form step — waiting for transition.');
          await page.waitForTimeout(2000);
          continue;
        }
      }

      await ensureApplyJurisdiction(page, currentProjectData);
      await dismissValidationToasts(page);
      await closeSelect2Dropdown(page);
      console.log(`Form step complete — clicking Next (${stepFingerprint || 'unknown step'}).`);
      await clickNextAndAdvance(page, nextButton, stepFingerprint);
      lastNextFingerprint = stepFingerprint;
      stuckOnSameStepCount = 0;
      continue;
    }

    if (step.isSubmitVisible) {
      console.log('Submit application visible — submitting to advance.');
      await submitButton.click({ force: true });
      const reachedPayment = await waitForPaymentStep(page);
      if (reachedPayment) return;
    }

    console.log(`Waiting for SR form step to render... (attempt ${attempt + 1}/20)`);
  }

  if (!await payButton.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
    throw new Error('SR application steps did not reach intake fee after 20 attempts.');
  }
});

When('completes the intake fee payment via Stripe if required', async ({ page }) => {
  await ensureApplyPageTenant(page);
  const payButton = page.locator('#PayIntakeFeeButton');

  const isPaymentRequired = await payButton
    .waitFor({ state: 'visible', timeout: 45000 })
    .then(() => true)
    .catch(() => false);

  if (!isPaymentRequired) {
    console.log('No intake fee button found — skipping Stripe payment.');
    return;
  }

  // Wait for background draft save so Pay button listeners are active
  await page.waitForTimeout(3000);

  let stripePage = null;
  let retries = 3;

  while (retries > 0 && !stripePage) {
    const popupPromise = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
    await payButton.click({ force: true });
    const popup = await popupPromise;

    if (popup) {
      stripePage = popup;
      break;
    }

    await page.waitForURL(/stripe\.com/, { timeout: 15000 }).catch(() => {});
    if (page.url().includes('stripe.com')) {
      stripePage = page;
      break;
    }

    console.log(`Stripe not reached yet. Retries left: ${retries - 1}`);
    retries--;
    await page.waitForTimeout(2000);
  }

  if (!stripePage) {
    throw new Error('Could not reach Stripe checkout after multiple attempts.');
  }

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

  const currentUrl = page.url();
  const srIdMatch = currentUrl.match(/serviceRequestId=([^&]+)/);
  const serviceRequestId = srIdMatch ? srIdMatch[1] : 'not-found-in-url';

  console.log(`Tracking Number: ${trackingNumber}`);
  console.log(`Service Request ID: ${serviceRequestId}`);
  expect(trackingNumber).not.toBe('not-found');
});
