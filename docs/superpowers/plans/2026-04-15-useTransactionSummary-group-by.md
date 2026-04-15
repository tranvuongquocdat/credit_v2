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

---

### 0.2. Verify `pawn_history` — Cầm đồ

```sql
SELECT
  p.contract_code,
  ph.created_at::date                            AS transaction_date,
  ph.transaction_type,
  ph.is_deleted,
  COALESCE(SUM(ph.credit_amount), 0)            AS credit_amount,
  COALESCE(SUM(ph.debit_amount), 0)              AS debit_amount,
  MAX(ph.updated_at) FILTER (WHERE ph.is_deleted = true) AS cancel_date,
  cust.name                                       AS customer_name,
  prof.username                                   AS employee_name,
  -- collateral_detail là JSON, cần trích tên
  COALESCE(
    p.collateral_detail ->> 'name',
    col.name
  )                                              AS item_name
FROM pawn_history ph
JOIN pawns p
    ON ph.pawn_id = p.id
JOIN customers cust
    ON p.customer_id = cust.id
LEFT JOIN profiles prof
    ON prof.id = ph.created_by
LEFT JOIN collaterals col
    ON p.collateral_id = col.id
WHERE (
    (ph.is_deleted = false AND ph.created_at BETWEEN $1 AND $2)
    OR
    (ph.is_deleted = true  AND ph.transaction_type = 'payment'
     AND ph.updated_at BETWEEN $1 AND $2)
)
GROUP BY
  p.contract_code,
  ph.created_at::date,
  ph.transaction_type,
  ph.is_deleted,
  cust.name,
  prof.username,
  p.collateral_detail,
  col.name
ORDER BY
  transaction_date DESC,
  p.contract_code;
```

- [ ] **Verify:** Chạy trong SQL Editor. `collateral_detail ->> 'name'` lấy tên tài sản cầm.
- [ ] **Check:** `pawns.store_id` filter có được apply không (thêm `p.store_id = $store_id` trong WHERE).
- [ ] **Check:** Nếu `p.collateral_detail` là JSON string thay vì JSONB, dùng `p.collateral_detail::json ->> 'name'`.

---

### 0.3. Verify `installment_history` — Trả góp

```sql
SELECT
  i.contract_code,
  ih.created_at::date                            AS transaction_date,
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
  transaction_date DESC,
  i.contract_code;
```

- [ ] **Verify:** Chạy trong SQL Editor. Filter `NOT IN ('contract_close', 'contract_rotate')` phải có.
- [ ] **Check:** Join path: `installments.employee_id → employees.user_id → profiles.id` (nếu `created_by` là `user_id` chứ không phải `profile.id`).

---

### 0.4. Verify `store_fund_history` — Nguồn vốn

```sql
SELECT
  sfh.created_at::date                            AS transaction_date,
  sfh.transaction_type,
  sfh.fund_amount,
  sfh.name                                        AS customer_name,
  sfh.id
FROM store_fund_history sfh
WHERE sfh.store_id = $1
  AND sfh.created_at BETWEEN $2 AND $3
GROUP BY
  sfh.id,
  sfh.created_at::date,
  sfh.transaction_type,
  sfh.fund_amount,
  sfh.name
ORDER BY
  transaction_date DESC;
```

**Lưu ý:** `store_fund_history` mỗi row là 1 transaction, không có nhiều row trùng key (trừ khi 2 row cùng id — không thể). Nếu muốn GROUP BY theo ngày + loại, dùng:

```sql
SELECT
  sfh.created_at::date                            AS transaction_date,
  sfh.transaction_type,
  COALESCE(SUM(sfh.fund_amount), 0)               AS fund_amount,
  sfh.name                                        AS customer_name,
  MAX(sfh.id)                                     AS latest_id
FROM store_fund_history sfh
WHERE sfh.store_id = $1
  AND sfh.created_at BETWEEN $2 AND $3
GROUP BY
  sfh.created_at::date,
  sfh.transaction_type,
  sfh.name
ORDER BY
  transaction_date DESC;
```

- [ ] **Verify:** Chạy trong SQL Editor. Chọn version phù hợp (group hay không group tùy data thực tế).
- [ ] **Check:** `fund_amount` là positive always, cần xử lý `withdrawal → expense` ở TypeScript.

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
WHERE (
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

- [ ] **Verify:** Chạy trong SQL Editor. `transactions.store_id = $1` phải có trong WHERE.
- [ ] **Check:** `t.credit_amount`, `t.debit_amount`, `t.amount` đều SUM đúng.

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
    ch.created_at::date,
    ch.transaction_type::TEXT,
    ch.is_deleted,
    COALESCE(SUM(ch.credit_amount), 0)::NUMERIC,
    COALESCE(SUM(ch.debit_amount), 0)::NUMERIC,
    MAX(ch.updated_at) FILTER (WHERE ch.is_deleted = true) AS cancel_date,
    cust.name,
    COALESCE(prof.username, '')
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

- [ ] **Step:** Tạo file migration `20260415_group_transaction_history.sql`
- [ ] **Step:** Paste function trên vào file
- [ ] **Step:** Chạy `supabase db reset` hoặc `supabase db push` để apply migration

### 1.2. RPC: `rpc_pawn_history_grouped`

```sql
CREATE OR REPLACE FUNCTION rpc_pawn_history_grouped(
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
  employee_name    TEXT,
  item_name        TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.contract_code,
    ph.created_at::date,
    ph.transaction_type::TEXT,
    ph.is_deleted,
    COALESCE(SUM(ph.credit_amount), 0)::NUMERIC,
    COALESCE(SUM(ph.debit_amount), 0)::NUMERIC,
    MAX(ph.updated_at) FILTER (WHERE ph.is_deleted = true) AS cancel_date,
    cust.name,
    COALESCE(prof.username, ''),
    -- collateral_detail: thử JSONB ->> 'name', fallback sang collaterals.name
    COALESCE(
      NULLIF(p.collateral_detail ->> 'name', ''),
      col.name,
      ''
    )::TEXT
  FROM pawn_history ph
  JOIN pawns p ON ph.pawn_id = p.id
  JOIN customers cust ON p.customer_id = cust.id
  LEFT JOIN profiles prof ON prof.id = ph.created_by
  LEFT JOIN collaterals col ON p.collateral_id = col.id
  WHERE (
      (ph.is_deleted = false AND ph.created_at BETWEEN p_start_date AND p_end_date)
      OR
      (ph.is_deleted = true  AND ph.transaction_type = 'payment'
       AND ph.updated_at BETWEEN p_start_date AND p_end_date)
    )
    AND p.store_id = p_store_id
  GROUP BY
    p.contract_code,
    ph.created_at::date,
    ph.transaction_type,
    ph.is_deleted,
    cust.name,
    prof.username,
    p.collateral_detail,
    col.name
  ORDER BY
    transaction_date DESC,
    contract_code;
END;
$$;
```

- [ ] **Step:** Thêm function trên vào file migration

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
    ih.created_at::date,
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
    transaction_date DESC,
    contract_code;
END;
$$;
```

- [ ] **Step:** Thêm function trên vào file migration

### 1.4. RPC: `rpc_store_fund_history_grouped`

```sql
CREATE OR REPLACE FUNCTION rpc_store_fund_history_grouped(
  p_store_id   UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS TABLE (
  transaction_date DATE,
  transaction_type TEXT,
  fund_amount     NUMERIC,
  customer_name   TEXT,
  id              UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sfh.created_at::date,
    sfh.transaction_type::TEXT,
    sfh.fund_amount,
    COALESCE(sfh.name, '')::TEXT,
    sfh.id
  FROM store_fund_history sfh
  WHERE sfh.store_id = p_store_id
    AND sfh.created_at BETWEEN p_start_date AND p_end_date
  GROUP BY
    sfh.id,
    sfh.created_at::date,
    sfh.transaction_type,
    sfh.fund_amount,
    sfh.name
  ORDER BY
    transaction_date DESC;
END;
$$;
```

- [ ] **Step:** Thêm function trên vào file migration

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
    t.created_at::date,
    t.transaction_type::TEXT,
    t.is_deleted,
    t.update_at,
    COALESCE(SUM(t.credit_amount), 0)::NUMERIC,
    COALESCE(SUM(t.debit_amount), 0)::NUMERIC,
    COALESCE(SUM(t.amount), 0)::NUMERIC,
    COALESCE(cust.name, '')::TEXT,
    COALESCE(t.employee_name, '')::TEXT
  FROM transactions t
  LEFT JOIN customers cust ON t.customer_id = cust.id
  WHERE (
      (t.is_deleted = false AND t.created_at BETWEEN p_start_date AND p_end_date)
      OR
      (t.is_deleted = true  AND t.transaction_type = 'payment'
       AND t.update_at BETWEEN p_start_date AND p_end_date)
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

**Mở rộng:** Script hiện chỉ test `credit_history`. Sau khi ổn, thêm test cho 4 bảng còn lại cùng file.

- [ ] **Step:** Chạy script cho `credit_history` trước — đảm bảo kết quả giống nhau
- [ ] **Step:** Sau khi ổn, mở rộng script test cho `pawn_history`, `installment_history`, `store_fund_history`, `transactions`

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
  customer_name: string; // = name field trong store_fund_history
  id: string;
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
      id: `nguon-von-${row.id}`,
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
