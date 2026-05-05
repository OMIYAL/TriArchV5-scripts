import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  // Increase test timeout to 2 minutes
  test.setTimeout(120000);
  
  await page.goto('https://stg-portal.triarch.ai/');
  await page.getByRole('link', { name: 'Access Portal' }).click();
  await page.getByRole('textbox', { name: 'Username' }).click();
  await page.getByRole('textbox', { name: 'Username' }).fill('admin');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('1q2w3E*');
  await page.getByRole('button', { name: 'Login' }).click();
  
  // Wait for navigation after login
  await page.waitForURL('https://stg-portal.triarch.ai/', { timeout: 30000 });
  
  // Wait for the Dashboard link to be visible
  await page.getByRole('link', { name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('link', { name: 'Dashboard' }).click();
  
  // Wait for page to load after Dashboard click
  await page.waitForLoadState('networkidle', { timeout: 15000 });
  
  // Navigate to Saas section
  const saasLink = page.locator('#desktop-sidebar a').filter({ hasText: 'Saas' }).first();
  await saasLink.waitFor({ state: 'visible', timeout: 15000 });
  await saasLink.click();
  await page.waitForTimeout(1000); // Reduced from 2000
  
  // Click Tenants and Editions
  await page.getByRole('link', { name: 'Tenants' }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('link', { name: 'Tenants' }).click();
  await page.getByRole('link', { name: 'Editions' }).click();
  
  await page.waitForTimeout(1000);
  
  // Navigate through StoreFront Settings links
  const storefrontLinks = [
    'Blog posts', 'Blogs', 'Comments', 'FAQ', 'Global resources', 
    'Menus', 'Newsletter users', 'Page feedbacks', 'Pages', 
    'Polls', 'Tags', 'Url forwarding', 'TriArchEvents', 
    'Branding', 'Forms'
  ];
  
  for (const linkName of storefrontLinks) {
    const storefrontLink = page.locator('#desktop-sidebar a').filter({ hasText: 'StoreFront Settings' }).first();
    await storefrontLink.waitFor({ state: 'visible', timeout: 15000 });
    await storefrontLink.click();
    await page.waitForTimeout(500); // Reduced from 1000
    
    const link = page.getByRole('link', { name: linkName });
    await link.waitFor({ state: 'visible', timeout: 15000 });
    await link.click();
    await page.waitForTimeout(300); // Reduced from 500
  }
});