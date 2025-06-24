import { test, expect } from '@playwright/test';

// Tests for login form validations and successful authentication.

test.describe('login form scenarios', () => {
  const loginUrl = 'http://localhost:3000/login';

  test('shows error on wrong credentials', async ({ page }) => {
    await page.goto(loginUrl);

    // Fill wrong credentials
    await page.getByRole('textbox', { name: 'Tên người dùng' }).fill('wrongusername');
    await page.getByRole('textbox', { name: 'Mật khẩu' }).fill('wrongpassword');
    await page.getByRole('button', { name: 'Đăng Nhập' }).click();

    // Expect error message
    await expect(page.getByText('Invalid login credentials')).toBeVisible();
  });

  test('redirects to dashboard on valid credentials', async ({ page }) => {
    await page.goto(loginUrl);

    // Fill valid credentials
    await page.getByRole('textbox', { name: 'Tên người dùng' }).fill('huyphuc1');
    await page.getByRole('textbox', { name: 'Mật khẩu' }).fill('123456');
    await page.getByRole('button', { name: 'Đăng Nhập' }).click();

    // Expect redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard$/);

    // Expect some element containing the username to appear (case-insensitive)
    await expect(page.locator('text=/huyphuc/i')).toBeVisible();
  });

  test('shows disabled account message for banned user', async ({ page }) => {
    await page.goto(loginUrl);

    await page.getByRole('textbox', { name: 'Tên người dùng' }).fill('kha');
    await page.getByRole('textbox', { name: 'Mật khẩu' }).fill('123456');
    await page.getByRole('button', { name: 'Đăng Nhập' }).click();

    // Expect account disabled error message
    await expect(page.getByText('Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên để biết thêm chi tiết.')).toBeVisible();
  });
}); 