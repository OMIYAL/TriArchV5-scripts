import path from 'path';
import { createBdd } from 'playwright-bdd';
import { Page } from '@playwright/test';
import { ProjectDetailPage } from '../../pages/build-room/project-detail.page';
import { ProjectItbIntakePage } from '../../pages/build-room/project-itb-intake.page';

const { When } = createBdd();

/** The project created earlier in the scenario, for the launch step that follows. */
const createdProjectId = new WeakMap<Page, string>();

When(
  'the Estimator creates a project from the ITB fixture {string} with bid deadline {string}',
  async ({ page }, fixtureFile: string, bidDeadline: string) => {
    const intake = new ProjectItbIntakePage(page);
    await intake.goto();
    await intake.openNewProject();
    await intake.uploadAndExtract(path.resolve(__dirname, '../../fixtures/build-room', fixtureFile));
    await intake.confirmAllExtractedFields();
    await intake.pickRandomGeneralContractor();
    await intake.fillBidDeadline(bidDeadline);
    createdProjectId.set(page, await intake.confirmAndCreate());
  }
);

When('the Estimator launches the phase', async ({ page }) => {
  const projectId = createdProjectId.get(page);
  if (!projectId) throw new Error('No project was created before launching.');
  const detail = new ProjectDetailPage(page);
  await detail.goto(projectId);
  await detail.launchAndOpenTakeOff();
});
