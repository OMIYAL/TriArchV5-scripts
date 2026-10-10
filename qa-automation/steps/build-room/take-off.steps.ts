import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { TakeOffPage } from '../../pages/build-room/take-off.page';

const { When, Then } = createBdd();

When('the Estimator clears any devices left on the count log', async ({ page }) => {
  await new TakeOffPage(page).removeAllDevices();
});

When('the Estimator removes the device {string} from the count log if it is there', async ({ page }, deviceName: string) => {
  await new TakeOffPage(page).removeDeviceIfPresent(deviceName);
});

When('the Estimator adds device {string} to the count log', async ({ page }, deviceName: string) => {
  await new TakeOffPage(page).addDevice(deviceName);
});

When('the Estimator places the device on the plan', async ({ page }) => {
  await new TakeOffPage(page).placeDeviceOnPlan();
});

// Symbols as "fx,fy fx,fy ..." — fractions of the sheet's full canvas, found per fixture sheet.
When('the Estimator places the device on the symbols at {string}', async ({ page }, symbols: string) => {
  const points = symbols
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [fx, fy] = pair.split(',').map(Number);
      if (Number.isNaN(fx) || Number.isNaN(fy)) throw new Error(`Bad symbol position "${pair}" — expected "fx,fy".`);
      return { fx, fy };
    });
  await new TakeOffPage(page).placeDeviceOnSymbols(points);
});

Then('the count log shows {int} placed for {string}', async ({ page }, count: number, deviceName: string) => {
  await expect(new TakeOffPage(page).countLog.qtyBadge(deviceName)).toHaveAttribute('aria-label', new RegExp(`^${count} total`));
});

When(
  'the Estimator sets the sheet scale to {string} using common scale {string}',
  async ({ page }, unit: string, commonScaleValue: string) => {
    await new TakeOffPage(page).setScale(unit as 'ft' | 'm' | 'in' | 'cm' | 'mm', commonScaleValue);
  }
);

When('the Estimator draws a linear run for the device on the plan', async ({ page }) => {
  await new TakeOffPage(page).placeLinearRun();
});

Then('the count log shows a non-zero length for {string}', async ({ page }, deviceName: string) => {
  await expect(new TakeOffPage(page).countLog.qtyBadge(deviceName)).not.toHaveAttribute('aria-label', /^0(\.0+)? /);
});

When('the Estimator changes the active plan to {string}', async ({ page }, sheetName: string) => {
  await new TakeOffPage(page).changeActivePlan(sheetName);
});
