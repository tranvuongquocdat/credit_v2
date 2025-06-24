import { test, expect } from '@playwright/test';

// Navigation test generated with MCP flow

test('portfolio navigation flow', async ({ page }) => {
  // 1. Go to home page
  await page.goto('http://localhost:3000/');

  // 2. Click "View My Work" and expect redirect to /portfolio/about
  await page.getByRole('button', { name: 'View My Work' }).click();
  await expect(page).toHaveURL(/\/portfolio\/about$/);

  // 3. Click "View My Projects" and expect redirect to /portfolio/projects
  await page.getByRole('button', { name: 'View My Projects' }).click();
  await expect(page).toHaveURL(/\/portfolio\/projects$/);

  // 4. Click button "1" and expect redirect to /login
  await page.getByRole('button', { name: '1' }).click();
  await expect(page).toHaveURL(/\/login$/);
}); 