import { createBdd } from 'playwright-bdd';
import { BuildRoomBasePage, ProjectStage, STAGE_LABELS } from '../../pages/build-room/base.page';
import { loginToBuildRoom } from '../../utils/buildroom-auth.helper';

const { Given, Then } = createBdd();

// Cucumber step definitions are global, so these serve every BuildRoom feature.
Given('the Estimator is logged in to BuildRoom', async ({ page }) => {
  await loginToBuildRoom(page);
});

// `label` is the name on the stage bar, e.g. "Quote review".
Then('the workflow is at the {string} stage', async ({ page }, label: string) => {
  const stage = (Object.keys(STAGE_LABELS) as ProjectStage[]).find((key) => STAGE_LABELS[key] === label);
  if (!stage) throw new Error(`Unknown stage "${label}" — expected one of: ${Object.values(STAGE_LABELS).join(', ')}.`);
  await new BuildRoomBasePage(page).expectWorkflowAt(stage);
});
