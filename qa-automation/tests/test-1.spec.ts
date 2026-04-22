import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://stg-portal.triarch.ai/');
  await page.getByRole('link', { name: 'ControlRoom' }).click();
  await page.getByRole('link', { name: 'BuildRoom' }).click();
  await page.getByRole('link', { name: 'About Us' }).click();
});