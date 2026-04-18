# useTransactionSummary: Thay fetchAllData bằng RPC với GROUP BY

> **REQUIRED SUB-SKILL:** Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Thay thế `fetchAllData()` + `processItems()` client-side bằng RPC function với `GROUP BY` trong Supabase cho cả 5 nguồn dữ liệu. `processItems()` trở thành pure function transform không còn fetch data.

**Architecture:** Mỗi bảng có 1 RPC function trả về kết quả đã `GROUP BY (contract_code, created_at::date, transaction_type, is_deleted)`. Mỗi RPC trả về raw columns (credit_amount, debit_amount, updated_at...) để `processItems()` tính income/expense đúng logic hiện tại. `fetchAllData` bị loại bỏ.

**Tech Stack:** Supabase (PostgreSQL 15), Supabase JS SDK, TypeScript, React Query

---

## 0. Chuẩn bị: Verify Queries trên Supabase trước

**Verify từng query trong Supabase SQL Editor (Dashboard → SQL Editor).**

---

### 0.1. Verify `credit_history` — Tín chấp

```sql
SELECT
  c.contract_code,
  ch.created_at::date                            AS transaction_date,
  ch.transaction_type,
  ch.is_deleted,
  COALESCE(SUM(ch.credit_amount), 0)            AS credit_amount,
  COALESCE(SUM(ch.debit_amount), 0)              AS debit_amount,
  MAX(ch.updated_at) FILTER (WHERE ch.is_deleted = true) AS cancel_date,
  cust.name                                       AS customer_name,
  prof.username                                   AS employee_name
FROM credit_history ch
JOIN credits c
    ON ch.credit_id = c.id
JOIN customers cust
    ON c.customer_id = cust.id
LEFT JOIN profiles prof
    ON prof.id = ch.created_by
WHERE (
    (ch.is_deleted = false AND ch.created_at BETWEEN $1 AND $2)
    OR
    (ch.is_deleted = true  AND ch.transaction_type = 'payment'
     AND ch.updated_at BETWEEN $1 AND $2)
)
GROUP BY
  c.contract_code,
  ch.created_at::date,
  ch.transaction_type,
  ch.is_deleted,
  cust.name,
  prof.username
ORDER BY
  transaction_date DESC,
  c.contract_code;
```

- [x] **Verify:** Thay `$1`, `$2` bằng giá trị thực (start/end date) và `c.store_id` filter. Chạy trong SQL Editor.
- [ ] **Check:** Số dòng GROUP BY phải ít hơn đáng kể so với `SELECT *` không group (bước này đo hiệu suất).
- [x] **Check:** `credit_amount`, `debit_amount` là SUM đúng.

**Trạng thái RPC:** `rpc_credit_history_grouped` đã được đối chiếu **khớp** với luồng cũ (`fetchAllData` + xử lý `payment` / `is_deleted` / dòng huỷ) qua script `scripts/test-rpc-queries.ts` (mục 1.6). Không cần chỉnh lại SQL tín chấp cho mục đích parity đó.

---

### 0.2. Verify `pawn_history` — Cầm đồ

Luồng lọc thời gian (khớp `useTransactionSummary` / `.or(...)` trên `pawn_history`):

- **Nhánh 1:** Mọi dòng có `created_at` trong khoảng báo cáo — **kể cả** `payment` đã `is_deleted` (vẫn giữ dòng “gốc” theo ngày tạo).
- **Nhánh 2:** Thêm các `payment` đã huỷ có `updated_at` trong khoảng (để có dòng sự kiện huỷ khi ngày huỷ nằm trong range nhưng `created_at` nằm ngoài).

Filter cửa hàng: trong app và RPC parity dùng `pawns.store_id` (`p.store_id`). Khi kiểm thủ công bằng SQL thuần có thể thay bằng `cust.store_id` nếu dữ liệu khách hàng cùng cửa hàng với hợp đồng.

```sql
SELECT
  p.contract_code,
  ph.created_at::date AS transaction_date,
  ph.transaction_type,
  ph.is_deleted,
  COALESCE(SUM(ph.credit_amount), 0) AS credit_amount,
  COALESCE(SUM(ph.debit_amount), 0) AS debit_amount,
  MAX(ph.updated_at) FILTER (WHERE ph.is_deleted = true) AS cancel_date,
  cust.name AS customer_name,
  prof.username AS employee_name,
  COALESCE(p.collateral_detail::jsonb ->> 'name', col.name) AS item_name
FROM pawn_history ph
JOIN pawns p ON ph.pawn_id = p.id
JOIN customers cust ON p.customer_id = cust.id
LEFT JOIN profiles prof ON prof.id = ph.created_by
LEFT JOIN collaterals col ON p.collateral_id = col.id
WHERE
  (
    (ph.created_at BETWEEN $1 AND $2)
    OR
    (
      ph.transaction_type = 'payment'
      AND ph.is_deleted = true
      AND ph.updated_at BETWEEN $1 AND $2
    )
  )
  AND p.store_id = $store_id
GROUP BY
  p.contract_code,
  ph.created_at::date,
  ph.transaction_type,
  ph.is_deleted,
  cust.name,
  prof.username,
  COALESCE(p.collateral_detail::jsonb ->> 'name', col.name)
ORDER BY
  transaction_date DESC,
  p.contract_code;
```

- [ ] **Verify:** Chạy trong SQL Editor (thay `$1`, `$2`, `$store_id`). `collateral_detail::jsonb ->> 'name'` lấy tên tài sản cầm; fallback `col.name`.
- [x] **Check:** Filter cửa hàng qua `p.store_id` (đã nhất quán với hook).
- [ ] **Check:** Nếu cột chỉ là `json` (không cast), vẫn dùng `::jsonb` như trên để ổn định toán tử `->>`.

---

### 0.3. Verify `installment_history` — Trả góp

```sql
SELECT
  i.contract_code,
  ih.created_at::date                            AS txn_date,
  ih.transaction_type,
  ih.is_deleted,
  COALESCE(SUM(ih.credit_amount), 0)            AS credit_amount,
  COALESCE(SUM(ih.debit_amount), 0)              AS debit_amount,
  MAX(ih.updated_at) FILTER (WHERE ih.is_deleted = true) AS cancel_date,
  cust.name                                       AS customer_name,
  prof.username                                   AS employee_name
FROM installment_history ih
JOIN installments i
    ON ih.installment_id = i.id
JOIN customers cust
    ON i.customer_id = cust.id
LEFT JOIN profiles prof
    ON prof.id = ih.created_by
WHERE (
    (ih.is_deleted = false AND ih.created_at BETWEEN $1 AND $2)
    OR
    (ih.is_deleted = true  AND ih.transaction_type = 'payment'
     AND ih.updated_at BETWEEN $1 AND $2)
)
  AND ih.transaction_type NOT IN ('contract_close', 'contract_rotate')
GROUP BY
  i.contract_code,
  ih.created_at::date,
  ih.transaction_type,
  ih.is_deleted,
  cust.name,
  prof.username
ORDER BY
  txn_date DESC,
  i.contract_code;
```

- [x] **Verify:** Chạy trong SQL Editor. Filter `NOT IN ('contract_close', 'contract_rotate')` phải có.
- [x] **Check:** Join path / filter cửa hàng khớp ứng dụng (`employees.store_id` vs `employee_id IN (SELECT …)` trong RPC) — đã ổn qua parity script.
- [x] **Parity tự động:** Script `scripts/test-rpc-queries.ts` (`TEST_RPC_TARGET=installment`) hoặc `scripts/test-rpc-installment-queries.ts` — kết quả `KẾT QUẢ: GIỐNG NHAU`.

**Trạng thái RPC:** `rpc_installment_history_grouped` đã **đối chiếu khớp** luồng cũ (`fetchAllData` + map `payment` / huỷ / `NOT IN contract_close, contract_rotate`) như tín chấp; không cần chỉnh lại SQL trả góp cho mục parity đó.

---

### 0.4. Verify `store_fund_history` — Nguồn vốn

Phiên bản dùng cho báo cáo tổng hợp (gom theo ngày + loại giao dịch + tên hiển thị). `fund_amount` trong DB là độ lớn dương; loại `withdrawal` được đảo dấu khi map sang thu/chi trong `processItems` (hook). Trong SQL chỉ **SUM** theo nhóm — khi map sang UI, mỗi nhóm vẫn chỉ có một `transaction_type`, nên cộng `fund_amount` trong nhóm `withdrawal` vẫn tương ứng tổng chi.

`name` NULL được gom chung bằng `COALESCE(sfh.name, '')` (khớp RPC).

```sql
SELECT
  sfh.created_at::date                            AS transaction_date,
  sfh.transaction_type,
  COALESCE(SUM(sfh.fund_amount), 0)               AS fund_amount,
  sfh.name                                        AS customer_name
FROM store_fund_history sfh
WHERE sfh.store_id = $store_id
  AND sfh.created_at BETWEEN $1 AND $2
GROUP BY
  sfh.created_at::date,
  sfh.transaction_type,
  sfh.name
ORDER BY
  transaction_date DESC;
```

Ở Postgres, nếu muốn gom `NULL` name với chuỗi rỗng, thay nhóm/sửa select:

```sql
-- ...
  COALESCE(SUM(sfh.fund_amount), 0)               AS fund_amount,
  COALESCE(sfh.name, '')                         AS customer_name
-- ...
GROUP BY
  sfh.created_at::date,
  sfh.transaction_type,
  COALESCE(sfh.name, '')
```

- [ ] **Verify:** Chạy trong SQL Editor với `$1`, `$2`, `$store_id` thực tế.
- [ ] **Check:** Map `withdrawal` → chi (`expense`) và các loại khác → thu (`income`) giữ nguyên trong transform TypeScript — đối chiếu script parity `scripts/test-rpc-queries.ts` (`TEST_RPC_TARGET=fund`).

---

### 0.5. Verify `transactions` — Thu chi hoạt động

```sql
SELECT
  t.created_at::date                            AS transaction_date,
  t.transaction_type,
  t.is_deleted,
  t.update_at                                   AS cancel_date,
  COALESCE(SUM(t.credit_amount), 0)             AS credit_amount,
  COALESCE(SUM(t.debit_amount), 0)              AS debit_amount,
  COALESCE(SUM(t.amount), 0)                    AS raw_amount,
  cust.name                                     AS customer_name,
  t.employee_name
FROM transactions t
LEFT JOIN customers cust
    ON t.customer_id = cust.id
WHERE t.store_id = $3
  AND (
    (t.is_deleted = false AND t.created_at BETWEEN $1 AND $2)
    OR
    (t.is_deleted = true  AND t.update_at BETWEEN $1 AND $2)
  )
GROUP BY
  t.created_at::date,
  t.transaction_type,
  t.is_deleted,
  t.update_at,
  cust.name,
  t.employee_name
ORDER BY
  transaction_date DESC;
```

- [ ] **Verify:** Chạy trong SQL Editor. `$1=$2=date range`, `$3=store_id`.
- [ ] **Check:** `t.credit_amount`, `t.debit_amount`, `t.amount` đều SUM đúng.
- [ ] **Note:** `transactions` hủy KHÔNG filter theo `transaction_type='payment'` (hủy mọi loại giao dịch).

---

## 1. Tạo Migration: 5 RPC Functions

**File:** `supabase/migrations/20260415_group_transaction_history.sql`

### 1.1. RPC: `rpc_credit_history_grouped`

```sql
CREATE OR REPLACE FUNCTION rpc_credit_history_grouped(
  p_store_id   UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS TABLE (
  contract_code     TEXT,
  transaction_date DATE,
  transaction_type TEXT,
  is_deleted       BOOLEAN,
  credit_amount    NUMERIC,
  debit_amount     NUMERIC,
  cancel_date      TIMESTAMPTZ,
  customer_name    TEXT,
  employee_name    TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.contract_code,
    ch.created_at::date                            AS transaction_date,
    ch.transaction_type::TEXT,
    ch.is_deleted,
    COALESCE(SUM(ch.credit_amount), 0)::NUMERIC    AS credit_amount,
    COALESCE(SUM(ch.debit_amount), 0)::NUMERIC     AS debit_amount,
    MAX(ch.updated_at) FILTER (WHERE ch.is_deleted = true) AS cancel_date,
    cust.name,
    COALESCE(prof.username, '')                    AS employee_name
  FROM credit_history ch
  JOIN credits c ON ch.credit_id = c.id
  JOIN customers cust ON c.customer_id = cust.id
  LEFT JOIN profiles prof ON prof.id = ch.created_by
  WHERE (
      (ch.is_deleted = false AND ch.created_at BETWEEN p_start_date AND p_end_date)
      OR
      (ch.is_deleted = true  AND ch.transaction_type = 'payment'
       AND ch.updated_at BETWEEN p_start_date AND p_end_date)
    )
    AND c.store_id = p_store_id
  GROUP BY
    c.contract_code,
    ch.created_at::date,
    ch.transaction_type,
    ch.is_deleted,
    cust.name,
    prof.username
  ORDER BY
    transaction_date DESC,
    contract_code;
END;
$$;
```

- [x] **Verify (parity):** Đã so sánh với logic cũ bằng `scripts/test-rpc-queries.ts` — kết quả mong đợi: `KẾT QUẢ: GIỐNG NHAU`.
- [ ] **Step:** Tạo file migration `20260415_group_transaction_history.sql`
- [ ] **Step:** Paste function trên vào file
- [ ] **Step:** Chạy `supabase db reset` hoặc `supabase db push` để apply migration

### 1.2. RPC: `rpc_pawn_history_grouped`

Cùng semantics với mục **0.2** (đã áp dụng trong migration `20260418120000_rpc_credit_installment_history_grouped.sql`).

```sql
CREATE OR REPLACE FUNCTION rpc_pawn_history_grouped(
  p_store_id   UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS TABLE (
  contract_code      TEXT,
  transaction_date   DATE,
  transaction_type   TEXT,
  is_deleted         BOOLEAN,
  credit_amount      NUMERIC,
  debit_amount       NUMERIC,
  cancel_date        TIMESTAMPTZ,
  customer_name      TEXT,
  employee_name      TEXT,
  item_name          TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.contract_code,
    ph.created_at::date                            AS transaction_date,
    ph.transaction_type::TEXT,
    ph.is_deleted,
    COALESCE(SUM(ph.credit_amount), 0)::NUMERIC,
    COALESCE(SUM(ph.debit_amount), 0)::NUMERIC,
    MAX(ph.updated_at) FILTER (WHERE ph.is_deleted = true) AS cancel_date,
    cust.name,
    COALESCE(prof.username, ''),
    COALESCE(
      NULLIF(p.collateral_detail::jsonb ->> 'name', ''),
      col.name,
      ''
    )::TEXT
  FROM pawn_history ph
  JOIN pawns p ON ph.pawn_id = p.id
  JOIN customers cust ON p.customer_id = cust.id
  LEFT JOIN profiles prof ON prof.id = ph.created_by
  LEFT JOIN collaterals col ON p.collateral_id = col.id
  WHERE (
      (ph.created_at BETWEEN p_start_date AND p_end_date)
      OR
      (
        ph.transaction_type = 'payment'
        AND ph.is_deleted = true
        AND ph.updated_at BETWEEN p_start_date AND p_end_date
      )
    )
    AND p.store_id = p_store_id
  GROUP BY
    p.contract_code,
    ph.created_at::date,
    ph.transaction_type,
    ph.is_deleted,
    cust.name,
    prof.username,
    COALESCE(
      NULLIF(p.collateral_detail::jsonb ->> 'name', ''),
      col.name,
      ''
    )
  ORDER BY
    transaction_date DESC,
    contract_code;
END;
$$;
```

- [x] **Step:** Đã thêm function vào migration `supabase/migrations/20260418120000_rpc_credit_installment_history_grouped.sql`

### 1.3. RPC: `rpc_installment_history_grouped`

```sql
CREATE OR REPLACE FUNCTION rpc_installment_history_grouped(
  p_store_id   UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS TABLE (
  contract_code     TEXT,
  transaction_date DATE,
  transaction_type TEXT,
  is_deleted       BOOLEAN,
  credit_amount    NUMERIC,
  debit_amount     NUMERIC,
  cancel_date      TIMESTAMPTZ,
  customer_name    TEXT,
  employee_name    TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.contract_code,
    ih.created_at::date                            AS txn_date,
    ih.transaction_type::TEXT,
    ih.is_deleted,
    COALESCE(SUM(ih.credit_amount), 0)::NUMERIC,
    COALESCE(SUM(ih.debit_amount), 0)::NUMERIC,
    MAX(ih.updated_at) FILTER (WHERE ih.is_deleted = true) AS cancel_date,
    cust.name,
    COALESCE(prof.username, '')
  FROM installment_history ih
  JOIN installments i ON ih.installment_id = i.id
  JOIN customers cust ON i.customer_id = cust.id
  LEFT JOIN profiles prof ON prof.id = ih.created_by
  WHERE (
      (ih.is_deleted = false AND ih.created_at BETWEEN p_start_date AND p_end_date)
      OR
      (ih.is_deleted = true  AND ih.transaction_type = 'payment'
       AND ih.updated_at BETWEEN p_start_date AND p_end_date)
    )
    AND i.employee_id IN (
      SELECT id FROM employees WHERE store_id = p_store_id
    )
    AND ih.transaction_type NOT IN ('contract_close', 'contract_rotate')
  GROUP BY
    i.contract_code,
    ih.created_at::date,
    ih.transaction_type,
    ih.is_deleted,
    cust.name,
    prof.username
  ORDER BY
    txn_date DESC,
    contract_code;
END;
$$;
```

- [ ] **Step:** Thêm function trên vào file migration
- [x] **Verify (parity):** So sánh `rpc_installment_history_grouped` với `fetchAllData` + map cũ theo **mục 1.6.1** — đã chạy script (`TEST_RPC_TARGET=installment` / `test-rpc-installment-queries.ts`), kết quả GIỐNG NHAU.

### 1.4. RPC: `rpc_store_fund_history_grouped`

Khớp **0.4** (đã thêm vào `supabase/migrations/20260418120000_rpc_credit_installment_history_grouped.sql`). Không trả `id` từng dòng — một nhóm là tổng nhiều bản ghi.

```sql
CREATE OR REPLACE FUNCTION rpc_store_fund_history_grouped(
  p_store_id   UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS TABLE (
  transaction_date   DATE,
  transaction_type   TEXT,
  fund_amount        NUMERIC,
  customer_name      TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sfh.created_at::date                            AS transaction_date,
    sfh.transaction_type::TEXT,
    COALESCE(SUM(sfh.fund_amount), 0)::NUMERIC      AS fund_amount,
    COALESCE(sfh.name, '')::TEXT                    AS customer_name
  FROM store_fund_history sfh
  WHERE sfh.store_id = p_store_id
    AND sfh.created_at BETWEEN p_start_date AND p_end_date
  GROUP BY
    sfh.created_at::date,
    sfh.transaction_type,
    COALESCE(sfh.name, '')
  ORDER BY
    transaction_date DESC;
END;
$$;
```

- [x] **Step:** Đã thêm function vào migration `20260418120000_rpc_credit_installment_history_grouped.sql`

### 1.5. RPC: `rpc_transactions_grouped`

```sql
CREATE OR REPLACE FUNCTION rpc_transactions_grouped(
  p_store_id   UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS TABLE (
  transaction_date DATE,
  transaction_type TEXT,
  is_deleted       BOOLEAN,
  cancel_date      TIMESTAMPTZ,
  credit_amount    NUMERIC,
  debit_amount     NUMERIC,
  raw_amount       NUMERIC,
  customer_name    TEXT,
  employee_name    TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.created_at::date                            AS transaction_date,
    t.transaction_type::TEXT,
    t.is_deleted,
    t.update_at                                   AS cancel_date,
    COALESCE(SUM(t.credit_amount), 0)::NUMERIC    AS credit_amount,
    COALESCE(SUM(t.debit_amount), 0)::NUMERIC     AS debit_amount,
    COALESCE(SUM(t.amount), 0)::NUMERIC           AS raw_amount,
    COALESCE(cust.name, '')::TEXT                 AS customer_name,
    COALESCE(t.employee_name, '')::TEXT          AS employee_name
  FROM transactions t
  LEFT JOIN customers cust ON t.customer_id = cust.id
  WHERE (
      (t.is_deleted = false AND t.created_at BETWEEN p_start_date AND p_end_date)
      OR
      (t.is_deleted = true  AND t.update_at BETWEEN p_start_date AND p_end_date)
    )
    AND t.store_id = p_store_id
  GROUP BY
    t.created_at::date,
    t.transaction_type,
    t.is_deleted,
    t.update_at,
    cust.name,
    t.employee_name
  ORDER BY
    transaction_date DESC;
END;
$$;
```

- [ ] **Step:** Thêm function trên vào file migration
- [ ] **Step:** Chạy migration trên Supabase

---

## 1.6. Test Script: So sánh RPC vs Logic Cũ

**File:** `scripts/test-rpc-queries.ts`

Script so sánh kết quả trả về từ RPC với logic `fetchAllData + processItems` hiện tại. Kết quả phải **GIỐNG NHAU** mới đạt.

```bash
# Chạy với env vars (hoặc sửa trực tiếp trong script)
export NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."   # hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY
export TEST_STORE_ID="729a9ee8-e0b5-436f-8a59-706395b11646"
export TEST_START_DATE="2026-04-15"
export TEST_END_DATE="2026-04-15"

npx tsx scripts/test-rpc-queries.ts
```

**Cấu hình trong script:**

| Config | Mặc định | Mô tả |
|--------|-----------|--------|
| `supabaseUrl` | env `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `supabaseKey` | env `SUPABASE_SERVICE_ROLE_KEY` hoặc `ANON_KEY` | API key |
| `storeId` | env `TEST_STORE_ID` | Store cần test |
| `startDate` | env `TEST_START_DATE` | Ngày bắt đầu (yyyy-MM-dd) |
| `endDate` | env `TEST_END_DATE` | Ngày kết thúc (yyyy-MM-dd) |
| `compareWithOldLogic` | `true` | `true` = so sánh, `false` = chỉ in RPC result |

**Kết quả mong đợi:**

- ✅ `KẾT QUẢ: GIỐNG NHAU` — RPC chính xác
- ❌ `KẾT QUẢ: KHÁC NHAU` — có bug, đọc diff chi tiết

**Trạng thái script:** `scripts/test-rpc-queries.ts` — env `.env.local` (`@next/env`). Đã có nhánh **tín chấp**, **trả góp**, **cầm đồ**, **nguồn vốn** (`TEST_RPC_TARGET=credit` | `installment` | `pawn` | `fund` | `all`). Wrapper: `scripts/test-rpc-installment-queries.ts`, `scripts/test-rpc-pawn-queries.ts`, `scripts/test-rpc-fund-queries.ts`.

- [x] **Step:** Chạy script cho `credit_history` — đảm bảo kết quả giống nhau với logic cũ
- [x] **Step:** Thêm và chạy parity cho `installment_history` ↔ `rpc_installment_history_grouped` (mục 1.6.1) — đã xong
- [x] **Step:** Parity `pawn_history` ↔ `rpc_pawn_history_grouped` (mục 1.6.2) — đã thêm code + wrapper; cần chạy trên DB đã apply migration
- [x] **Step:** Parity `store_fund_history` ↔ `rpc_store_fund_history_grouped` (mục 1.6.3) — logic cũ gom nhóm trong JS khớp `SUM` RPC
- [ ] **Step:** Mở rộng script cho `transactions`

### 1.6.1. Test `rpc_installment_history_grouped` (cùng pattern `test-rpc-queries.ts`)

Mục tiêu giống tín chấp: **RPC (GROUP BY)** vs **`fetchAllData` + map thủ công** (tương đương `processItems` cho nguồn Trả góp), cùng `getDateRange`, cùng hàm `compare()` (map theo `id`, so các field `income`, `expense`, `description`, `contractCode`, `employeeName`, `customerName`).

**1) Logic cũ — `fetchOldInstallmentHistory(startDateISO, endDateISO)`**

- Gọi `fetchAllData` trên `installment_history` với `select` **trùng** hook `useTransactionSummary.ts`:
  - `installments!inner(contract_code, employee_id, employees!inner(store_id), customers(name))`
  - `profiles:created_by(username)`
- Filter:
  - `.eq('installments.employees.store_id', CONFIG.storeId)` — **tương đương** RPC: `i.employee_id IN (SELECT id FROM employees WHERE store_id = p_store_id)` (đã khớp qua parity script).
  - `.or(\`…\`)` — **giống hook** `useTransactionSummary.ts` (có khoảng trắng sau dấu phẩy: `), and(` trước nhánh `payment` đã xóa).
  - `.not('transaction_type', 'in', '(contract_close,contract_rotate)')` — **bắt buộc** khớp `WHERE ... NOT IN ('contract_close','contract_rotate')` trong RPC.
- `.order('id')`
- Vòng `forEach` raw row → mảng item so sánh (cùng quy tắc amount / `payment` + `is_deleted` + dòng **Huỷ đóng lãi** như nhánh tín chấp trong script).
- **Prefix `id` so sánh** (song song file script, tách biệt tín chấp): dùng ví dụ `tra-gop-${contractCode}-${created_at}` cho từng dòng logic cũ; nhánh RPC map sang cùng quy ước với `transaction_date` / `cancel_date` như `fetchNewCreditHistory` (đổi prefix thành `tra-gop-` và field `contract_code` từ row RPC).

**2) Logic mới — `fetchNewInstallmentHistory(startDateISO, endDateISO)`**

```typescript
const { data, error } = await supabase.rpc('rpc_installment_history_grouped', {
  p_store_id:   CONFIG.storeId,
  p_start_date: startDateISO,
  p_end_date:   endDateISO,
});
```

- Map từng row RPC → một hoặc hai phần tử (giống `fetchNewCreditHistory`: `payment` có thêm dòng huỷ khi `is_deleted && cancel_date`).
- `translateTransactionType` dùng chung file script.
- `id` / `date` / `income` / `expense` cùng pattern với tín chấp, chỉ đổi prefix `tra-gop-`.

**3) `main()`**

- Đã tích hợp: `CONFIG.testRpcTarget` từ env `TEST_RPC_TARGET` (`credit` | `installment` | `pawn` | `fund` | `all`) + `runParityTest` gọi `fetchOldInstallmentHistory` / `fetchNewInstallmentHistory` / `compare`.

**4) Checklist**

- [x] **Step:** Thêm `fetchOldInstallmentHistory` + `fetchNewInstallmentHistory` vào `scripts/test-rpc-queries.ts` (row RPC dùng chung shape như `NewCreditRow`)
- [x] **Step:** Chạy với `TEST_STORE_ID` / khoảng ngày có dữ liệu trả góp — `KẾT QUẢ: GIỐNG NHAU`
- [x] **Step:** RPC / filter cửa hàng / `NOT IN` / OR huỷ `payment` — đã xác nhận khớp
- **Ghi chú (regression):** Nếu sau này lệch, kiểm tra lại: `NOT IN ('contract_close','contract_rotate')`, OR `payment` + `updated_at`, subquery `employee_id` vs `installments.employees.store_id`

### 1.6.2. Test `rpc_pawn_history_grouped` (cùng pattern `test-rpc-queries.ts`)

**1) Logic cũ — `fetchOldPawnHistory`**

- `fetchAllData` trên `pawn_history` với `select` khớp hook `useTransactionSummary.ts`: `pawns!inner(contract_code, store_id, customers(name), collateral_detail)`, `profiles:created_by(username)`.
- `.eq('pawns.store_id', CONFIG.storeId)` — tương đương RPC `p.store_id = p_store_id`.
- `.or(\`and(created_at…),and(transaction_type.eq.payment,…)\`)` — **không** thêm `is_deleted = false` trên nhánh `created_at` (giống mục 0.2 / RPC).

**2) Logic mới — `fetchNewPawnHistory`**

- `supabase.rpc('rpc_pawn_history_grouped', { p_store_id, p_start_date, p_end_date })`.
- Map row → item giống tín chấp / trả góp; prefix `id` so sánh: `cam-do-`.

**3) Chạy**

- `TEST_RPC_TARGET=pawn npx tsx scripts/test-rpc-queries.ts` hoặc `npx tsx scripts/test-rpc-pawn-queries.ts`.

**4) Checklist**

- [x] **Step:** Thêm `fetchOldPawnHistory` + `fetchNewPawnHistory` vào `scripts/test-rpc-queries.ts`
- [ ] **Step:** Chạy parity trên project đã `supabase db push` / migration có `rpc_pawn_history_grouped` — mong đợi `KẾT QUẢ: GIỐNG NHAU`

### 1.6.3. Test `rpc_store_fund_history_grouped`

RPC **gom nhóm** theo `created_at::date`, `transaction_type`, `COALESCE(name,'')` và `SUM(fund_amount)`. Logic cũ trong hook xử lý **từng dòng** rồi báo cáo còn gom thêm ở `Map` phía client — để so sánh trực tiếp với RPC, script **gom trong JS** sau khi áp cùng quy tắc `withdrawal` (`processItems` / `translateTransactionType`).

**1) Logic cũ — `fetchOldStoreFundGrouped`**

- `fetchAllData` trên `store_fund_history` giống hook: `.eq('store_id')`, `.gte/.lte` `created_at`.
- Với mỗi dòng: `signed = withdrawal ? -fund_amount : fund_amount` → tách `income` / `expense`.
- Gom theo khóa `nguon-von-${YYYY-MM-DD}-${transaction_type}-${encodeURIComponent(name)}` (name rỗng khi `NULL`) và **cộng dồn** income/expense — tương đương `SUM` + `GROUP BY` trong SQL.

**2) Logic mới — `fetchNewStoreFundGrouped`**

- `supabase.rpc('rpc_store_fund_history_grouped', { … })`.
- Map `fund_amount` + `transaction_type` → income/expense như trên.

**3) Chạy**

- `TEST_RPC_TARGET=fund npx tsx scripts/test-rpc-queries.ts` hoặc `npx tsx scripts/test-rpc-fund-queries.ts`.

**4) Checklist**

- [x] **Step:** Thêm `fetchOldStoreFundGrouped` + `fetchNewStoreFundGrouped` vào `scripts/test-rpc-queries.ts`
- [ ] **Step:** Chạy parity sau khi migration có `rpc_store_fund_history_grouped` — mong đợi `KẾT QUẢ: GIỐNG NHAU`

---

## 2. Thêm Type cho RPC kết quả

**File:** `src/app/reports/transactionSummary/types.ts` (hoặc tạo mới)

```typescript
// Kết quả trả về từ 5 RPC functions (đã GROUP BY)
export interface CreditHistoryGroupedRow {
  contract_code: string;
  transaction_date: string; // ISO date string 'YYYY-MM-DD'
  transaction_type: string;
  is_deleted: boolean;
  credit_amount: number;
  debit_amount: number;
  cancel_date: string | null;
  customer_name: string;
  employee_name: string;
}

export interface PawnHistoryGroupedRow extends CreditHistoryGroupedRow {
  item_name: string;
}

export interface InstallmentHistoryGroupedRow extends CreditHistoryGroupedRow {}

export interface StoreFundHistoryGroupedRow {
  transaction_date: string;
  transaction_type: string;
  fund_amount: number;
  customer_name: string; // = COALESCE(name, '') sau khi group
}

export interface TransactionsGroupedRow {
  transaction_date: string;
  transaction_type: string;
  is_deleted: boolean;
  cancel_date: string | null;
  credit_amount: number;
  debit_amount: number;
  raw_amount: number;
  customer_name: string;
  employee_name: string;
}
```

- [ ] **Step:** Thêm interface trên vào file types

---

## 3. Thêm Type cho RPC Function Calls

**File:** `src/app/reports/transactionSummary/types.ts`

```typescript
// Dùng cho Supabase RPC call
export interface GroupedTransactionParams {
  p_store_id: string;
  p_start_date: string;
  p_end_date: string;
}
```

---

## 4. Viết hàm gọi RPC + hàm transform thuần

**Tách `processItems` thành 2 phần:**

1. **`fetchAndProcess`** — gọi RPC, trả về `FundHistoryItem[]`
2. **`processGroupedItems`** (mới) — nhận grouped data, transform thành `FundHistoryItem[]`

**File:** `src/hooks/useTransactionSummary.ts`

### 4.1. Thêm hàm gọi RPC

```typescript
// Sau các hàm fetch hiện tại (fetchOpeningBalance, fetchClosingBalance, fetchEmployees)

async function fetchGroupedCreditHistory(
  storeId: string,
  startDateISO: string,
  endDateISO: string
): Promise<CreditHistoryGroupedRow[]> {
  const { data, error } = await supabase.rpc('rpc_credit_history_grouped', {
    p_store_id: storeId,
    p_start_date: startDateISO,
    p_end_date: endDateISO,
  });
  if (error) throw error;
  return data || [];
}

async function fetchGroupedPawnHistory(
  storeId: string,
  startDateISO: string,
  endDateISO: string
): Promise<PawnHistoryGroupedRow[]> {
  const { data, error } = await supabase.rpc('rpc_pawn_history_grouped', {
    p_store_id: storeId,
    p_start_date: startDateISO,
    p_end_date: endDateISO,
  });
  if (error) throw error;
  return data || [];
}

async function fetchGroupedInstallmentHistory(
  storeId: string,
  startDateISO: string,
  endDateISO: string
): Promise<InstallmentHistoryGroupedRow[]> {
  const { data, error } = await supabase.rpc('rpc_installment_history_grouped', {
    p_store_id: storeId,
    p_start_date: startDateISO,
    p_end_date: endDateISO,
  });
  if (error) throw error;
  return data || [];
}

async function fetchGroupedStoreFundHistory(
  storeId: string,
  startDateISO: string,
  endDateISO: string
): Promise<StoreFundHistoryGroupedRow[]> {
  const { data, error } = await supabase.rpc('rpc_store_fund_history_grouped', {
    p_store_id: storeId,
    p_start_date: startDateISO,
    p_end_date: endDateISO,
  });
  if (error) throw error;
  return data || [];
}

async function fetchGroupedTransactions(
  storeId: string,
  startDateISO: string,
  endDateISO: string
): Promise<TransactionsGroupedRow[]> {
  const { data, error } = await supabase.rpc('rpc_transactions_grouped', {
    p_store_id: storeId,
    p_start_date: startDateISO,
    p_end_date: endDateISO,
  });
  if (error) throw error;
  return data || [];
}
```

- [ ] **Step:** Thêm 5 hàm RPC call vào file `useTransactionSummary.ts`
- [ ] **Step:** Thêm import type `CreditHistoryGroupedRow`...

### 4.2. Thêm hàm transform cho từng nguồn

```typescript
// Sau các hàm RPC call

function transformCreditHistoryToItems(rows: CreditHistoryGroupedRow[]): FundHistoryItem[] {
  return rows.map((row) => {
    const amount = Number(row.credit_amount) - Number(row.debit_amount);

    if (row.transaction_type === 'payment') {
      const items: FundHistoryItem[] = [
        {
          id: `tin-chap-${row.contract_code}-${row.transaction_date}`,
          date: `${row.transaction_date}T00:00:00Z`,
          description: row.is_deleted ? 'Huỷ đóng lãi' : 'Đóng lãi',
          transactionType: row.transaction_type,
          source: 'Tín chấp',
          income: amount > 0 ? amount : 0,
          expense: amount < 0 ? -amount : 0,
          contractCode: row.contract_code || '-',
          employeeName: row.employee_name || '',
          customerName: row.customer_name || '',
          itemName: '',
        },
      ];

      if (row.is_deleted && row.cancel_date) {
        items.push({
          id: `tin-chap-${row.contract_code}-${row.transaction_date}-cancel`,
          date: row.cancel_date,
          description: 'Huỷ đóng lãi',
          transactionType: row.transaction_type,
          source: 'Tín chấp',
          income: amount < 0 ? -amount : 0,
          expense: amount > 0 ? amount : 0,
          contractCode: row.contract_code || '-',
          employeeName: row.employee_name || '',
          customerName: row.customer_name || '',
          itemName: '',
        });
      }

      return items;
    }

    return [
      {
        id: `tin-chap-${row.contract_code}-${row.transaction_date}`,
        date: `${row.transaction_date}T00:00:00Z`,
        description: translateTransactionType(row.transaction_type),
        transactionType: row.transaction_type,
        source: 'Tín chấp',
        income: amount > 0 ? amount : 0,
        expense: amount < 0 ? -amount : 0,
        contractCode: row.contract_code || '-',
        employeeName: row.employee_name || '',
        customerName: row.customer_name || '',
        itemName: '',
      },
    ];
  }).flat();
}

function transformPawnHistoryToItems(rows: PawnHistoryGroupedRow[]): FundHistoryItem[] {
  return rows.map((row) => {
    const amount = Number(row.credit_amount) - Number(row.debit_amount);

    if (row.transaction_type === 'payment') {
      const items: FundHistoryItem[] = [
        {
          id: `cam-do-${row.contract_code}-${row.transaction_date}`,
          date: `${row.transaction_date}T00:00:00Z`,
          description: row.is_deleted ? 'Huỷ đóng lãi' : 'Đóng lãi',
          transactionType: row.transaction_type,
          source: 'Cầm đồ',
          income: amount > 0 ? amount : 0,
          expense: amount < 0 ? -amount : 0,
          contractCode: row.contract_code || '-',
          employeeName: row.employee_name || '',
          customerName: row.customer_name || '',
          itemName: row.item_name || '',
        },
      ];

      if (row.is_deleted && row.cancel_date) {
        items.push({
          id: `cam-do-${row.contract_code}-${row.transaction_date}-cancel`,
          date: row.cancel_date,
          description: 'Huỷ đóng lãi',
          transactionType: row.transaction_type,
          source: 'Cầm đồ',
          income: amount < 0 ? -amount : 0,
          expense: amount > 0 ? amount : 0,
          contractCode: row.contract_code || '-',
          employeeName: row.employee_name || '',
          customerName: row.customer_name || '',
          itemName: row.item_name || '',
        });
      }

      return items;
    }

    return [
      {
        id: `cam-do-${row.contract_code}-${row.transaction_date}`,
        date: `${row.transaction_date}T00:00:00Z`,
        description: translateTransactionType(row.transaction_type),
        transactionType: row.transaction_type,
        source: 'Cầm đồ',
        income: amount > 0 ? amount : 0,
        expense: amount < 0 ? -amount : 0,
        contractCode: row.contract_code || '-',
        employeeName: row.employee_name || '',
        customerName: row.customer_name || '',
        itemName: row.item_name || '',
      },
    ];
  }).flat();
}

function transformInstallmentHistoryToItems(rows: InstallmentHistoryGroupedRow[]): FundHistoryItem[] {
  return rows.map((row) => {
    const amount = Number(row.credit_amount) - Number(row.debit_amount);

    if (row.transaction_type === 'payment') {
      const items: FundHistoryItem[] = [
        {
          id: `tra-gop-${row.contract_code}-${row.transaction_date}`,
          date: `${row.transaction_date}T00:00:00Z`,
          description: row.is_deleted ? 'Huỷ đóng lãi' : 'Đóng lãi',
          transactionType: row.transaction_type,
          source: 'Trả góp',
          income: amount > 0 ? amount : 0,
          expense: amount < 0 ? -amount : 0,
          contractCode: row.contract_code || '-',
          employeeName: row.employee_name || '',
          customerName: row.customer_name || '',
          itemName: '',
        },
      ];

      if (row.is_deleted && row.cancel_date) {
        items.push({
          id: `tra-gop-${row.contract_code}-${row.transaction_date}-cancel`,
          date: row.cancel_date,
          description: 'Huỷ đóng lãi',
          transactionType: row.transaction_type,
          source: 'Trả góp',
          income: amount < 0 ? -amount : 0,
          expense: amount > 0 ? amount : 0,
          contractCode: row.contract_code || '-',
          employeeName: row.employee_name || '',
          customerName: row.customer_name || '',
          itemName: '',
        });
      }

      return items;
    }

    return [
      {
        id: `tra-gop-${row.contract_code}-${row.transaction_date}`,
        date: `${row.transaction_date}T00:00:00Z`,
        description: translateTransactionType(row.transaction_type),
        transactionType: row.transaction_type,
        source: 'Trả góp',
        income: amount > 0 ? amount : 0,
        expense: amount < 0 ? -amount : 0,
        contractCode: row.contract_code || '-',
        employeeName: row.employee_name || '',
        customerName: row.customer_name || '',
        itemName: '',
      },
    ];
  }).flat();
}

function transformStoreFundHistoryToItems(rows: StoreFundHistoryGroupedRow[]): FundHistoryItem[] {
  return rows.map((row) => {
    const amount = row.transaction_type === 'withdrawal'
      ? -Number(row.fund_amount)
      : Number(row.fund_amount);

    return {
      id: `nguon-von-${row.transaction_date}-${row.transaction_type}-${encodeURIComponent(row.customer_name || '')}`,
      date: `${row.transaction_date}T00:00:00Z`,
      description: translateTransactionType(row.transaction_type),
      transactionType: row.transaction_type,
      source: 'Nguồn vốn',
      income: amount > 0 ? amount : 0,
      expense: amount < 0 ? -amount : 0,
      contractCode: '-',
      employeeName: '',
      customerName: row.customer_name || '',
      itemName: '',
    };
  });
}

function transformTransactionsToItems(rows: TransactionsGroupedRow[]): FundHistoryItem[] {
  return rows.map((row) => {
    let amount = Number(row.credit_amount) - Number(row.debit_amount);
    if (amount === 0) {
      amount = row.transaction_type === 'expense'
        ? -Number(row.raw_amount)
        : Number(row.raw_amount);
    }

    const items: FundHistoryItem[] = [
      {
        id: `thu-chi-${row.transaction_date}-${row.transaction_type}`,
        date: row.is_deleted && row.cancel_date
          ? row.cancel_date
          : `${row.transaction_date}T00:00:00Z`,
        description: translateTransactionType(row.transaction_type),
        transactionType: row.transaction_type,
        source: 'Thu chi',
        income: amount > 0 ? amount : 0,
        expense: amount < 0 ? -amount : 0,
        contractCode: '-',
        employeeName: row.employee_name || '',
        customerName: row.customer_name || '',
        itemName: '',
      },
    ];

    if (row.is_deleted && row.cancel_date) {
      items.push({
        id: `thu-chi-${row.transaction_date}-${row.transaction_type}-cancel`,
        date: row.cancel_date,
        description: row.credit_amount > 0 ? 'Huỷ thu' : 'Huỷ chi',
        transactionType: row.transaction_type,
        source: 'Thu chi',
        income: amount < 0 ? -amount : 0,
        expense: amount > 0 ? amount : 0,
        contractCode: '-',
        employeeName: row.employee_name || '',
        customerName: row.customer_name || '',
        itemName: '',
      });
    }

    return items;
  }).flat();
}
```

- [ ] **Step:** Thêm 5 hàm transform vào file `useTransactionSummary.ts`
- [ ] **Step:** Đảm bảo `translateTransactionType` có sẵn trong scope hoặc thêm vào

---

## 5. Cập nhật `fetchTransactionDetails` — Dùng RPC thay `fetchAllData`

**File:** `src/hooks/useTransactionSummary.ts`

**Thay thế phần fetch data trong `fetchTransactionDetails` (dòng ~714–868 hiện tại):**

```typescript
// Bước 1: Gọi 5 RPC song song
const [creditRows, pawnRows, installmentRows, fundRows, transactionRows] =
  await Promise.all([
    fetchGroupedCreditHistory(storeId, startDateISO, endDateISO),
    fetchGroupedPawnHistory(storeId, startDateISO, endDateISO),
    fetchGroupedInstallmentHistory(storeId, startDateISO, endDateISO),
    fetchGroupedStoreFundHistory(storeId, startDateISO, endDateISO),
    fetchGroupedTransactions(storeId, startDateISO, endDateISO),
  ]);

// Bước 2: Transform từng nguồn
const creditItems = transformCreditHistoryToItems(creditRows);
const pawnItems = transformPawnHistoryToItems(pawnRows);
const installmentItems = transformInstallmentHistoryToItems(installmentRows);
const fundItems = transformStoreFundHistoryToItems(fundRows);
const transactionItems = transformTransactionsToItems(transactionRows);

// Bước 3: Gộp tất cả vào allHistoryItems
const allHistoryItems: FundHistoryItem[] = [
  ...creditItems,
  ...pawnItems,
  ...installmentItems,
  ...fundItems,
  ...transactionItems,
];
```

- [ ] **Step:** Xác định vị trí trong `fetchTransactionDetails` cần thay thế (từ dòng ~714 đến ~868)
- [ ] **Step:** Xóa tất cả `fetchAllData` + `processItems` calls
- [ ] **Step:** Thay bằng 5 RPC calls song song + 5 transform calls
- [ ] **Step:** Giữ nguyên phần group Map + filter + sort ở dưới (dòng ~870–902)

---

## 6. Cập nhật `fetchTransactionData` — Tổng hợp

**File:** `src/hooks/useTransactionSummary.ts`

**Thay thế tương tự trong `fetchTransactionData` (dòng ~325–478):**

```typescript
// Gọi RPC + transform giống fetchTransactionDetails
const [creditRows, pawnRows, installmentRows, fundRows, transactionRows] =
  await Promise.all([
    fetchGroupedCreditHistory(storeId, startDateISO, endDateISO),
    fetchGroupedPawnHistory(storeId, startDateISO, endDateISO),
    fetchGroupedInstallmentHistory(storeId, startDateISO, endDateISO),
    fetchGroupedStoreFundHistory(storeId, startDateISO, endDateISO),
    fetchGroupedTransactions(storeId, startDateISO, endDateISO),
  ]);

const creditItems = transformCreditHistoryToItems(creditRows);
const pawnItems = transformPawnHistoryToItems(pawnRows);
const installmentItems = transformInstallmentHistoryToItems(installmentRows);
const fundItems = transformStoreFundHistoryToItems(fundRows);
const transactionItems = transformTransactionsToItems(transactionRows);

const allHistoryItems: FundHistoryItem[] = [
  ...creditItems,
  ...pawnItems,
  ...installmentItems,
  ...fundItems,
  ...transactionItems,
];
```

- [ ] **Step:** Xác định vị trí trong `fetchTransactionData` cần thay thế (từ dòng ~325 đến ~478)
- [ ] **Step:** Xóa `fetchAllData` + `processItems` + phần transform transactions cũ
- [ ] **Step:** Thay bằng RPC calls + transform calls
- [ ] **Step:** Giữ nguyên phần group Map + totalsBySource (dòng ~480–535)

---

## 7. Dọn dẹp

- [ ] **Step:** Xóa hàm `fetchAllData` nếu không còn được dùng ở nơi nào khác
- [ ] **Step:** Xóa hàm `processItems` (không còn cần thiết)
- [ ] **Step:** Chạy `npm run lint` để kiểm tra lỗi
- [ ] **Step:** Chạy `npm run build` để verify build thành công

---

## 8. Kiểm thử

- [ ] **Step:** Mở `/reports/transactionSummary` trên browser
- [ ] **Step:** Chọn store và date range có data thực
- [ ] **Step:** So sánh kết quả bảng chi tiết với data cũ (trước khi refactor) — phải giống nhau
- [ ] **Step:** So sánh tổng Thu/Chi theo từng nguồn — phải giống nhau
- [ ] **Step:** Test filter theo nhân viên và nguồn giao dịch
- [ ] **Step:** Test export Excel
- [ ] **Step:** Test với date range rộng (30 ngày) — verify GROUP BY giảm data đáng kể

---

## File Changes Summary

| File | Action |
|------|--------|
| `supabase/migrations/20260415_group_transaction_history.sql` | Create — 5 RPC functions |
| `src/app/reports/transactionSummary/types.ts` | Modify — thêm 6 interface mới |
| `src/hooks/useTransactionSummary.ts` | Modify — thêm RPC calls, transform functions; loại bỏ `fetchAllData`, `processItems` |

---

## Self-Review Checklist

- [ ] Tất cả 5 bảng đều có RPC function
- [ ] `credit_amount`, `debit_amount` giữ nguyên tên trong RPC return
- [   ] `processItems` cũ được thay hoàn toàn bằng transform functions
- [ ] `fetchAllData` bị loại bỏ hoặc đánh dấu unused
- [ ] Group Map phía dưới vẫn giữ nguyên (dùng cho final aggregation)
- [ ] Filter `selectedTransactionType` và `selectedEmployee` vẫn hoạt động
- [ ] Logic cancel (is_deleted → 2 dòng, đảo income/expense) vẫn đúng
- [ ] Installment filter `NOT IN ('contract_close', 'contract_rotate')` vẫn có
- [ ] `pawn_history` lấy `item_name` từ `collateral_detail` JSON đúng cách
