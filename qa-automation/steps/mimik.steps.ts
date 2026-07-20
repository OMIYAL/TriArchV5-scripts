import { Given, Then } from '../fixtures/mimik.fixture';
import { MimikHelper, getMimikExportFormat, isMimikGuideMode } from '../utils/mimik.helper';

Given('Mimik recording is started', async ({ page, context }) => {
  if (!isMimikGuideMode()) {
    return;
  }
  await new MimikHelper(context, page).startRecording();
});

Then('Mimik recording is stopped and the guide is exported', async ({ page, context }) => {
  if (!isMimikGuideMode()) {
    return;
  }
  await new MimikHelper(context, page).stopAndExport(getMimikExportFormat());
});

/** @deprecated Use "Mimik recording is started" — kept for older feature files. */
Given('the operator has started Mimik recording', async ({ page, context }) => {
  if (!isMimikGuideMode()) {
    return;
  }
  await new MimikHelper(context, page).startRecording();
});
