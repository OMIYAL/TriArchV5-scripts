import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { fillAllVisibleEmptyFields } from '../utils/form-fill.helper';

const { When, Then } = createBdd();


When('the user navigates to the Contact page', async ({ page }) => {
  // Prod nav label: "Contact" — Stg nav label: "Contact Us"
  // Scope to the banner/nav to avoid picking up the "Contact us" footer link.
  const navLink = page.locator('header, [role="banner"], nav').getByRole('link', { name: /^Contact/i }).first();
  await navLink.click();
  await page.waitForLoadState('domcontentloaded');
});



When('the user fills in all contact form fields', async ({ page }) => {
  await fillAllVisibleEmptyFields(page);
});


When('the user clicks the {string} button', async ({ page }, btnName: string) => {
  await page.getByRole('button', { name: new RegExp(btnName, 'i') }).click();
});


Then('the contact request is submitted successfully', async ({ page }) => {
  // Stg: "Thank you for contacting us" / "Message received"
  // Prod: "Message sent" (h3) + "Thanks for reaching out..." (p) — both visible simultaneously.
  // Target the heading first to avoid strict-mode violation from 2 elements matching.
  // The .or() fallback catches environments where the confirmation is a <p> not a heading.
  const CONFIRMATION = /Message sent|Message received|Thank you for contacting us/i;
  await expect(
    page.getByRole('heading', { name: CONFIRMATION })
      .or(page.getByText(CONFIRMATION).first())
      .first()
  ).toBeVisible({ timeout: 15000 });
});


Then('the {string} validation message is displayed', async ({ page }, validationMsg: string) => {
  await expect(page.getByText(validationMsg, { exact: true })).toBeVisible({ timeout: 5000 });
});
