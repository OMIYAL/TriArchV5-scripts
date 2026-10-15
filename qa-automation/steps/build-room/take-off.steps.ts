import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { TakeOffPage } from '../../pages/build-room/take-off.page';
import { getScenarioState, resolveDevice } from '../../utils/scenario-state';

const { When, Then } = createBdd();

When('the Estimator clears any devices left on the count log', async ({ page }) => {
  await new TakeOffPage(page).removeAllDevices();
});

When('the Estimator adds any catalog device as {string} to the count log', async ({ page }, alias: string) => {
  const state = getScenarioState(page);
  state.devices[alias] = await new TakeOffPage(page).addAnyCatalogDevice(Object.values(state.devices));
});

When('the Estimator places the device on the plan', async ({ page }) => {
  await new TakeOffPage(page).placeDeviceOnPlan();
});

Then('the count log shows {int} placed for {string}', async ({ page }, count: number, ref: string) => {
  const deviceName = resolveDevice(page, ref);
  await expect(new TakeOffPage(page).countLog.qtyBadge(deviceName)).toHaveAttribute(
    'aria-label',
    new RegExp(`^${count} total`)
  );
});
