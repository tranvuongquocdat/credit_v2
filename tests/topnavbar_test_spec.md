# TopNavbar Test Specification

This scenario covers visibility and basic interaction of the **TopNavbar** component once a user is authenticated and on the Dashboard page.

## Pre-condition

* User already exists with:
  * Username `huyphuc1`
  * Password `123456`
* Account is active (not disabled).

> The automated test logs in with these credentials before every assertion.

---

## UI Elements Verified

| Selector / Role | Expected Text | Purpose |
|-----------------|--------------|---------|
| `link[href="/dashboard"]` | `CR&nbsp;Quản lý Credit` | Application logo, returns to dashboard |
| `button` by role with name **`Chọn cửa hàng`** | *None* | Opens store-selection dropdown |
| `button` by role with name **`H huyphuc1`** | Shows avatar initial **H** + username | Opens user-profile dropdown |
| Notification icon buttons (`User`, `Bike`, `DollarSign`, `Salad`) | Icon only | Hover shows tip, may display numeric badge |

---

## Interaction Flow

1. **Navigate** to `/login` and log in with valid credentials.  Browser is redirected to `/dashboard`.
2. **Verify** that the navbar is fixed at the top and contains all elements in the table above.
3. **Click** the avatar button `H huyphuc1`.
   * Dropdown becomes visible containing:
     * Link "**Hồ sơ cá nhân**" → `/profile`
     * Button "**Đăng xuất**"
4. **Click** the store button **Chọn cửa hàng** (optional future test): store list should appear.
5. *(Optional)* Check that notification badges are rendered when API returns non-zero counts.

---

## Expected Outcomes

* All navbar elements are **visible** immediately after login.
* Clicking avatar toggles the **profile dropdown**, which contains exactly two actionable items.
* Clicking logo link keeps you on `/dashboard` (current page reload).

---

## Implementation Notes

* Spec implemented in `tests/topnavbar.spec.ts` with Playwright.
* The test reuses login helper steps defined in other specs to authenticate. 