import { Given, Then } from '../fixtures/mimik.fixture';
import { MimikHelper, isMimikGuideMode } from '../utils/mimik.helper';

Given('Mimik recording is started', async ({ page, context }) => {
  if (!isMimikGuideMode()) return;
  await new MimikHelper(context, page).startRecording();
});

Then('Mimik recording is stopped', async ({ page, context }) => {
  if (!isMimikGuideMode()) return;
  await new MimikHelper(context, page).stopRecording();
});

Then('the Mimik guide is opened from the side panel', async ({ page, context }) => {
  if (!isMimikGuideMode()) return;
  await new MimikHelper(context, page).openLatestGuide();
});

Then('the Mimik guide is exported as PDF', async ({ page, context }) => {
  if (!isMimikGuideMode()) return;
  await new MimikHelper(context, page).exportGuideAs('pdf');
});
