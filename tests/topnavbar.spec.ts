import { test, expect } from '@playwright/test';

/**
 * TopNavbar visibility & interaction test.
 */

test('top navbar elements and dropdowns', async ({ page }) => {
  // Login first
  await page.goto('http://localhost:3000/login');
  await page.getByRole('textbox', { name: 'Tên người dùng' }).fill('huyphuc1');
  await page.getByRole('textbox', { name: 'Mật khẩu' }).fill('123456');
  await page.getByRole('button', { name: 'Đăng Nhập' }).click();

  // Assert redirect
  await expect(page).toHaveURL(/\/dashboard$/);

  // 1. Logo link visible
  const logo = page.getByRole('link', { name: /Quản lý Credit/i });
  await expect(logo).toBeVisible();

  // 2. Store selector button visible
  await expect(page.getByRole('button', { name: 'Chọn cửa hàng' })).toBeVisible();

  // 3. Avatar button shows username
  const avatarBtn = page.getByRole('button', { name: /huyphuc1/i });
  await expect(avatarBtn).toBeVisible();

  // 4. Click avatar -> dropdown appears
  await avatarBtn.click();
  await expect(page.getByRole('link', { name: 'Hồ sơ cá nhân' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng xuất' }).first()).toBeVisible();
});

test('store dropdown opens on click', async ({ page }) => {
  // Login first
  await page.goto('http://localhost:3000/login');
  await page.getByRole('textbox', { name: 'Tên người dùng' }).fill('huyphuc1');
  await page.getByRole('textbox', { name: 'Mật khẩu' }).fill('123456');
  await page.getByRole('button', { name: 'Đăng Nhập' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Click store selector
  const storeBtn = page.getByRole('button', { name: 'Chọn cửa hàng' });
  await storeBtn.click();
  // Expect dropdown content (empty list placeholder or any store entry)
  const dropdownPlaceholder = page.getByText(/Đang tải cửa hàng|Không có cửa hàng nào|Đang chọn/i);
  await expect(dropdownPlaceholder).toBeVisible();
});

test('user can log out from avatar dropdown', async ({ page }) => {
  // Login first
  await page.goto('http://localhost:3000/login');
  await page.getByRole('textbox', { name: 'Tên người dùng' }).fill('huyphuc1');
  await page.getByRole('textbox', { name: 'Mật khẩu' }).fill('123456');
  await page.getByRole('button', { name: 'Đăng Nhập' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Open avatar dropdown and click logout
  await page.getByRole('button', { name: /huyphuc1/i }).click();
  const logoutBtn = page.getByRole('button', { name: 'Đăng xuất' }).last();
  await Promise.all([
    page.waitForURL(/\/login$/),
    logoutBtn.evaluate((el: HTMLElement) => el.click())
  ]);

  // Expect redirect to login page and login form visible
  await expect(page.getByRole('button', { name: 'Đăng Nhập' })).toBeVisible();
}); 