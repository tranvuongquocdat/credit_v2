# Login Test Specification

This document summarizes the automated test scenarios implemented with Playwright for the login flow.

---

## 1. Navigation to Login Form

| Step | Action | Expected URL |
|------|--------|--------------|
| 1 | Go to **`http://localhost:3000/`** | `/` |
| 2 | Click **"View My Work"** button | `/portfolio/about` |
| 3 | Click **"View My Projects"** button | `/portfolio/projects` |
| 4 | Click circular **button "1"** in "My Development Process" section | `/login` |

---

## 2. Invalid Credentials Scenario

| Step | Action | Expectation |
|------|--------|-------------|
| 1 | On the **Login** page, fill **Username** with `wrongusername` | |
| 2 | Fill **Password** with `wrongpassword` | |
| 3 | Click **"Đăng Nhập"** | |
| 4 | An error message **"Invalid login credentials"** becomes visible | Test passes |

---

## 3. Valid Credentials Scenario

| Step | Action | Expectation |
|------|--------|-------------|
| 1 | On the **Login** page, fill **Username** with `huyphuc1` | |
| 2 | Fill **Password** with `123456` | |
| 3 | Click **"Đăng Nhập"** | |
| 4 | Browser redirects to **`/dashboard`** | |
| 5 | Navbar displays the current user name (e.g. **`huyphuc1`**) and the element is visible | Test passes |

---

## 4. Disabled / Banned Account Scenario

| Step | Action | Expectation |
|------|--------|-------------|
| 1 | On the **Login** page, fill **Username** with `kha` | |
| 2 | Fill **Password** with `123456` | |
| 3 | Click **"Đăng Nhập"** | |
| 4 | Error message **"Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên để biết thêm chi tiết."** is visible | Test passes |

---

## 5. Notes & Implementation Details

* Tests are located in:
  * `tests/navigation.spec.ts` – covers navigation flow to the login page.
  * `tests/login_form.spec.ts` – covers invalid and valid login scenarios.
* After fixing the auth-cache refresh (forcing `getCurrentUser(forceRefresh = true)` on `SIGNED_IN`), all tests pass consistently.
* To execute only these specs:

```bash
npx playwright test tests/navigation.spec.ts tests/login_form.spec.ts
```

* The Playwright reporter output (line reporter) shows `1 passed` for navigation and `2 passed` for login scenarios.
