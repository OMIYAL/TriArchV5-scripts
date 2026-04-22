import { test, expect } from '@playwright/test';

test.describe('Theme Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Set longer timeout for this hook
    test.setTimeout(120000);
    
    // Navigate to portal and login
    await page.goto('https://stg-portal.triarch.ai/');
    await page.waitForTimeout(4000);
    await page.getByRole('link', { name: 'Access Portal' }).click();
    await page.waitForTimeout(4000);
    await page.getByRole('textbox', { name: 'Username' }).fill('admin');
    await page.waitForTimeout(4000);
    await page.getByRole('textbox', { name: 'Password' }).fill('1q2w3E*');
    await page.waitForTimeout(4000);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForTimeout(4000);
    
    // Wait for navigation with longer timeout
    await page.waitForURL('https://stg-portal.triarch.ai/', { timeout: 60000 });
    await page.waitForTimeout(4000);
    
    // Open settings
    await page.locator('.setting > .bi').first().click();
    await page.waitForTimeout(4000);
  });

  test('should switch between different theme modes', async ({ page }) => {
    // Switch to Light theme
    await page.locator('#settings-routes a').filter({ hasText: 'Light' }).click();
    await page.waitForTimeout(4000);
    await expect(page.locator('#settings-routes a').filter({ hasText: 'Light' })).toBeVisible();
    await page.waitForTimeout(4000);

    // Switch to Semi-Dark theme
    await page.locator('#settings-routes a').filter({ hasText: 'Semi-Dark' }).click();
    await page.waitForTimeout(4000);
    await expect(page.locator('#settings-routes a').filter({ hasText: 'Semi-Dark' })).toBeVisible();
    await page.waitForTimeout(4000);

    // Switch to Dark theme
    await page.locator('#settings-routes a').filter({ hasText: 'Dark' }).first().click();
    await page.waitForTimeout(4000);
    await expect(page.locator('#settings-routes a').filter({ hasText: 'Dark' }).first()).toBeVisible();
    await page.waitForTimeout(4000);

    // Switch to System theme
    await page.locator('#settings-routes a').filter({ hasText: 'System' }).click();
    await page.waitForTimeout(4000);
    await expect(page.locator('#settings-routes a').filter({ hasText: 'System' })).toBeVisible();
    await page.waitForTimeout(4000);
  });
});