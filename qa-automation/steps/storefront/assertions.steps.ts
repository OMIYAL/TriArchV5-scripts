import { Then } from '../support/fixtures';
import {
  assertServiceRequestSubmitted,
  captureTrackingNumber,
  persistCitizenSrState,
} from '../../flows/storefront/citizen-submit-sr.flow';

Then('the service request should be submitted successfully', async ({ page }) => {
  await assertServiceRequestSubmitted(page);
});

Then('the system should generate a tracking number', async ({ page, scenarioCtx }) => {
  await captureTrackingNumber(page, scenarioCtx);
});

Then('the service request state should be set to {string}', async ({ page, scenarioCtx }, expectedStatus: string) => {
  persistCitizenSrState(page, scenarioCtx, expectedStatus);
});

