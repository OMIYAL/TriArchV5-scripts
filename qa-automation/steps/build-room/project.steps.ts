import path from 'path';
import { createBdd } from 'playwright-bdd';
import { expect, Page } from '@playwright/test';
import { ProjectDetailPage } from '../../pages/build-room/project-detail.page';
import { ProjectItbIntakePage } from '../../pages/build-room/project-itb-intake.page';
import { TakeOffPage } from '../../pages/build-room/take-off.page';

const { When, Then } = createBdd();

/** The project created earlier in the scenario, for the launch step that follows. */
const createdProjectId = new WeakMap<Page, string>();

When(
  'the Estimator creates a project from the ITB fixture {string} with GC {string} and bid deadline {string}',
  async ({ page }, fixtureFile: string, gcName: string, bidDeadline: string) => {
    const intake = new ProjectItbIntakePage(page);
    await intake.goto();
    await intake.openNewProject();
    await intake.uploadAndExtract(path.resolve(__dirname, '../../fixtures/build-room', fixtureFile));
    await intake.confirmAllExtractedFields();
    await intake.pickGeneralContractor(gcName);
    await intake.fillBidDeadline(bidDeadline);
    await intake.confirmAndCreate();
    createdProjectId.set(page, intake.getCreatedProjectId());
  }
);

// A new project starts under a default department, and the department is locked once launched.
When(
  'the Estimator assigns department {string} and launches the Fire alarm phase',
  async ({ page }, departmentName: string) => {
    const projectId = createdProjectId.get(page);
    if (!projectId) throw new Error('No project was created before launching.');
    const detail = new ProjectDetailPage(page);
    await detail.goto(projectId);
    await detail.assignDepartment(departmentName);
    await detail.launchPhase();
  }
);

Then('the Take-Off stage is unlocked', async ({ page }) => {
  await expect(new TakeOffPage(page).addDeviceButton).toBeEnabled();
});
