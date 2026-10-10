import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { DiscountStructuresPage } from '../../pages/build-room/discount-structures.page';
import { DiscountRuleComponent } from '../../pages/build-room/components/discount-rule.component';

const { When, Then } = createBdd();

When('the Estimator opens Discount Structures', async ({ page }) => {
  const discountStructures = new DiscountStructuresPage(page);
  await discountStructures.goto();
});

When('the Estimator opens the New rule panel', async ({ page }) => {
  const discountStructures = new DiscountStructuresPage(page);
  const rulePanel = new DiscountRuleComponent(page);
  await discountStructures.openNewRule();
  await rulePanel.waitForOpen();
});

Then('the New rule panel shows the expected fields', async ({ page }) => {
  const rulePanel = new DiscountRuleComponent(page);
  await rulePanel.assertDefaultControlsVisible();
});

When(
  'the Estimator scopes the new rule to manufacturer {string} at {int} percent off list',
  async ({ page }, manufacturer: string, percentOff: number) => {
    const rulePanel = new DiscountRuleComponent(page);
    await rulePanel.selectManufacturer(manufacturer);
    await rulePanel.choosePercentOffMode();
    await rulePanel.fillValue(String(percentOff));
  }
);

Then('the New rule preview reports how many {string} parts would net', async ({ page }, manufacturer: string) => {
  const rulePanel = new DiscountRuleComponent(page);
  const text = await rulePanel.waitForPreview();
  expect(text).toMatch(new RegExp(`Would net \\d+ ${manufacturer} parts`, 'i'));
  console.log(`[discount-structures] Preview: ${text}`);
});

/** MM/DD/YYYY, N days from today — a fixed date would eventually be in the past and be rejected. */
function relativeDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Effective From always resets to today and Effective To can't be earlier, so an expired rule can't
 * be created here. Saving it inactive keeps it from applying to real price imports.
 */
When("the Estimator sets the new rule's effective window to tomorrow and marks it inactive", async ({ page }) => {
  const rulePanel = new DiscountRuleComponent(page);
  await rulePanel.fillEffectiveTo(relativeDate(1));
  await rulePanel.setActive(false);
});

When('the Estimator saves the New rule panel', async ({ page }) => {
  const rulePanel = new DiscountRuleComponent(page);
  await rulePanel.save();
});

Then(
  'the grid shows the {string} rule rated {string} and marked {string}',
  async ({ page }, manufacturer: string, expectedRate: string, expectedActiveStatus: string) => {
    const discountStructures = new DiscountStructuresPage(page);
    await expect(discountStructures.ruleRowRateLocator(manufacturer)).toHaveText(expectedRate);
    await expect(discountStructures.ruleRowActiveStatusLocator(manufacturer)).toContainText(expectedActiveStatus);
  }
);
