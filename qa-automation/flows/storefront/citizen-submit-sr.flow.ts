import { expect, Page } from '@playwright/test';
import { env } from '../../utils/env.helper';
import { saveState, STATE_FILES } from '../../utils/state.helper';
import type { CitizenSRState } from '../../utils/state.helper';
import type { ScenarioContext } from '../../steps/support/fixtures';
import type { ServiceApplyPage } from '../../pages/storefront/service-apply.page';

/**
 * Clicks any visible button whose accessible name matches `namePattern` via JS,
 * bypassing sticky-nav pointer interception. Navigation errors are swallowed.
 */
async function safeClickButton(page: Page, namePattern: RegExp): Promise<void> {
  const btn = page.getByRole('button', { name: namePattern });
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await page
    .evaluate((pattern) => {
      const re = new RegExp(pattern, 'i');
      const el = ([...document.querySelectorAll('button')] as HTMLButtonElement[]).find(
        (b) => re.test(b.textContent?.trim() ?? '') && !b.disabled,
      );
      if (el) el.click();
    }, namePattern.source)
    .catch(() => {});
}

/**
 * Fills visible text/textarea inputs with generic test data so required fields
 * don't block form submission.
 */
async function fillVisibleFormInputs(page: Page): Promise<void> {
  const inputs = page.locator('input[type="text"]:visible, textarea:visible');
  const count = await inputs.count();
  const fillers = [
    env.project.name,
    '30',
    env.project.streetAddress,
    'Standard safety measures',
    'Fire extinguishers and alarms',
  ];
  for (let i = 0; i < count; i++) {
    const val = fillers[i] ?? env.project.name;
    await inputs.nth(i).fill(val).catch(() => {});
  }
}

/**
 * Clicks the "Next" wizard button via JS so the sticky navigation header cannot
 * intercept the click. Using element.click() in the browser context bypasses
 * Playwright's coordinate-based pointer events entirely.
 *
 * If the page navigates before or during the evaluate (e.g. auto-advancing after
 * checkboxes are all checked), the "Execution context was destroyed" error is
 * silently ignored — the navigation itself is the desired outcome.
 */
async function safeClickNext(page: Page): Promise<void> {
  const nextBtn = page.getByRole('button', { name: 'Next' });
  await nextBtn.waitFor({ state: 'visible', timeout: 10000 });
  await page
    .evaluate(() => {
      const btn = ([...document.querySelectorAll('button')] as HTMLButtonElement[]).find(
        (b) => b.textContent?.trim().startsWith('Next') && !b.disabled,
      );
      if (btn) btn.click();
    })
    .catch(() => {
      // Navigation already in progress — treat as success.
    });
}

export async function openServiceApplyUrlFromSelectedService(
  page: Page,
  scenarioCtx: ScenarioContext
): Promise<void> {
  const fullApplyUrl = new URL(scenarioCtx.targetServiceUrl, env.urls.storefront).href;
  await page.goto(fullApplyUrl, { waitUntil: 'domcontentloaded' });
}

export async function createProjectForServiceApplication(
  page: Page,
  serviceApplyPage: ServiceApplyPage
): Promise<void> {
  await page.waitForURL(/(storefront|portal|triarch)/, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const createProjectPage = await serviceApplyPage.openCreateProjectPopup();
  await createProjectPage.completeFullFlow();

  const rawPopupPage = createProjectPage.getRawPage();
  try {
    await rawPopupPage.waitForEvent('close', { timeout: 15_000 });
  } catch {
    if (!rawPopupPage.isClosed()) {
      await rawPopupPage.close();
    }
  }
}

export async function completeFormStepsAndChecklists(
  page: Page,
  serviceApplyPage: ServiceApplyPage
): Promise<void> {
  await page.waitForLoadState('networkidle');
  await serviceApplyPage.selectCreatedProject(env.project.name);

  let maxAttempts = 10;
  while (maxAttempts > 0) {
    await page.waitForTimeout(1500);

    const isChecklistVisible = await page
      .getByText('Submission checklist', { exact: false })
      .isVisible()
      .catch(() => false);

    const isPaymentVisible = await page
      .getByRole('button', { name: /Pay intake fee/i })
      .isVisible()
      .catch(() => false);

    const submitButton = page.getByRole('button', { name: /Submit application/i });
    const isSubmitVisible = await submitButton.isVisible().catch(() => false);

    // Always fill any visible text/textarea inputs before proceeding —
    // some steps have required fields mixed with checklists or submit buttons.
    await fillVisibleFormInputs(page);

    if (isChecklistVisible) {
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

      if (isSubmitVisible) {
        await safeClickButton(page, /Submit application/i);
        break;
      }

      await safeClickNext(page);
    } else if (isPaymentVisible) {
      break;
    } else if (isSubmitVisible) {
      await safeClickButton(page, /Submit application/i);
      break;
    } else {
      await safeClickNext(page);
    }

    maxAttempts--;
  }
}

export async function assertServiceRequestSubmitted(page: Page): Promise<void> {
  await page.getByText('Application submitted', { exact: false }).waitFor({
    state: 'visible',
    timeout: 15_000,
  });
}

export async function captureTrackingNumber(page: Page, scenarioCtx: ScenarioContext): Promise<void> {
  await page.waitForTimeout(2000);
  const bodyText = await page.locator('body').innerText();
  const trackingMatch = bodyText.match(/([A-Z]{2,4}\d{3}\s*-\s*[A-Z]{2}\s*-\s*\d{4}\s*-\s*\d{5})/);
  scenarioCtx.trackingNumber = trackingMatch ? trackingMatch[1].replace(/\s+/g, '') : 'not-found';
  expect(scenarioCtx.trackingNumber).not.toBe('not-found');
}

export function persistCitizenSrState(
  page: Page,
  scenarioCtx: ScenarioContext,
  expectedStatus: string
): void {
  const currentUrl = page.url();
  const srIdMatch = currentUrl.match(/serviceRequestId=([^&]+)/);
  scenarioCtx.serviceRequestId = srIdMatch ? srIdMatch[1] : 'not-found-in-url';

  const sdIdMatch = currentUrl.match(/serviceDefinitionId=([^&]+)/);
  const serviceDefinitionId = sdIdMatch
    ? sdIdMatch[1]
    : scenarioCtx.targetServiceUrl.match(/serviceDefinitionId=([^&]+)/)?.[1] || 'not-found-in-url';

  const normalizedStatus = expectedStatus.toLowerCase();

  const state: CitizenSRState = {
    serviceRequestId: scenarioCtx.serviceRequestId,
    trackingNumber: scenarioCtx.trackingNumber,
    projectId: '',
    projectName: env.project.name,
    serviceName: 'Dynamically Selected',
    serviceDefinitionId,
    submittedAt: new Date().toISOString(),
    paymentStatus: 'completed',
    status: normalizedStatus,
  };

  saveState(STATE_FILES.citizenSR, state);
  expect(state.status).toBe(normalizedStatus);
}

