import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://stg-portal.triarch.ai/');
  await page.waitForTimeout(3000);
  
  await page.getByRole('link', { name: 'ControlRoom' }).click();
  await page.waitForTimeout(3000);
  
  await page.getByRole('link', { name: 'BuildRoom' }).click();
  await page.waitForTimeout(3000);
  
  await page.getByRole('link', { name: 'About Us' }).click();
  await page.waitForTimeout(3000);
});