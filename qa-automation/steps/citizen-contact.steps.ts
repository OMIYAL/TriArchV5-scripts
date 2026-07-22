import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { fillAllVisibleEmptyFields } from '../utils/form-fill.helper';

const { When, Then } = createBdd();


When('the user navigates to the Contact page', async ({ page }) => {
  await page.getByRole('link', { name: /Contact Us/i }).first().click();
  await page.waitForLoadState('domcontentloaded');
});


When('the user fills in all contact form fields', async ({ page }) => {
  await fillAllVisibleEmptyFields(page);
});


When('the user clicks the {string} button', async ({ page }, btnName: string) => {
  await page.getByRole('button', { name: new RegExp(btnName, 'i') }).click();
});


Then('the contact request is submitted successfully', async ({ page }) => {
  // FIX: this assertion previously had a .catch() that swallowed failure and just logged a
  // message — meaning this step could NEVER fail the test, regardless of what the page
  // actually showed. If the exact text needs updating, that should surface as a real
  // assertion failure (with a clear diff) so it gets fixed, not silently pass forever.
  await expect(page.getByText(/Thank you for contacting us|Message received/i)).toBeVisible({ timeout: 15000 });
});

Then('the {string} validation message is displayed', async ({ page }, validationMsg: string) => {
  await expect(page.getByText(validationMsg, { exact: true })).toBeVisible({ timeout: 5000 });
});
