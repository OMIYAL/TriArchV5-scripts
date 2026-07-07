import { When } from '../support/fixtures';
import {
  completeFormStepsAndChecklists,
  createProjectForServiceApplication,
  openServiceApplyUrlFromSelectedService,
} from '../../flows/storefront/citizen-submit-sr.flow';

When('the citizen creates a new project for the service application', async ({ page, serviceApplyPage, scenarioCtx }) => {
  await openServiceApplyUrlFromSelectedService(page, scenarioCtx);
  await createProjectForServiceApplication(page, serviceApplyPage);
});

When('the citizen completes all required form steps and checklists', async ({ page, serviceApplyPage }) => {
  await completeFormStepsAndChecklists(page, serviceApplyPage);
});

