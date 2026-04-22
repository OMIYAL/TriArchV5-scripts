import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

test('test', async ({ page }) => {
  // Increase test timeout
  test.setTimeout(120000); // 2 minutes

  const username = process.env.USER_NAME;
  const password = process.env.USER_PASSWORD;
  const baseUrl = process.env.BASE_URL || 'https://stg-portal.triarch.ai/';

  // Verify environment variables are loaded
  if (!username || !password) {
    throw new Error('Environment variables USER_NAME and USER_PASSWORD must be set in .env file');
  }

  console.log('Username from env:', username);
  console.log('Password length:', password.length);

  await page.goto(baseUrl);
  await page.waitForTimeout(3000);
  
  await page.getByRole('link', { name: 'Access Portal' }).click();
  await page.waitForTimeout(3000);
  
  await page.getByRole('textbox', { name: 'Username' }).click();
  await page.waitForTimeout(3000);
  
  await page.getByRole('textbox', { name: 'Username' }).fill(username);
  await page.waitForTimeout(3000);
  
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.waitForTimeout(3000);
  
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.waitForTimeout(3000);
  
  await page.getByRole('button', { name: 'Password' }).click();
  await page.waitForTimeout(3000);
  
  await page.getByRole('checkbox', { name: 'Remember me' }).check();
  await page.waitForTimeout(3000);
  
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForTimeout(3000);
  
  await page.goto(baseUrl);
  await page.waitForTimeout(3000);
});