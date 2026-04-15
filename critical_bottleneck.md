# Performance Bottleneck Analysis — Nuvoras Credit System

> **Ngày phân tích:** 2026-04-12
> **Scope:** Load time trang chính ~1-2s
> **Framework:** Next.js 15 + Supabase (PostgreSQL 15)

---

## Tóm tắt Executive Summary

| # | Bottleneck | Severity | Effort | Impact |
|---|-----------|----------|--------|--------|
| 1 | Sequential RPC chain (7 RPCs chạy tuần tự) | 🔴 CRITICAL | Medium | ~400-700ms |
| 2 | Thiếu composite index trên history tables | 🔴 CRITICAL | Low | ~200-400ms |
| 3 | Financial calculations không dùng React Query cache | 🟠 HIGH | Medium | Cache miss on every nav |
| 4 | Dashboard 18+ sequential queries trong for-loop | 🟠 HIGH | Medium | ~500-800ms |
| 5 | TopNavbar warning counts chạy tuần tự | 🟡 MEDIUM | Low | ~100-150ms |

**Thứ tự ưu tiên đề xuất:** 2 → 1 → 3 → 5 → 4

---

## 🔴 BOTTLENECK 1: Sequential RPC Chain — useCreditCalculations

**Severity:** 🔴 CRITICAL
**Estimated Impact:** ~400-700ms mỗi page load
**Files:**
- `src/hooks/useCreditCalculations.ts` (dòng 39-227)
- `src/hooks/useCreditsSummary.ts` (dòng 19-98)

### Vấn đề

Mỗi khi credits page mount, `useCreditCalculations` gọi **7 RPC functions tuần tự** — mỗi cái chờ cái trước xong rồi mới chạy:

```typescript
async function fetchAllData() {
  // 1. Sequential queries
  const { data: storeData } = await supabase.from('stores').select(...)     // chờ ✅
  const { data: activeCredits } = await supabase.from('credits_by_store')   // chờ ✅
  const { data: closedCredits } = await supabase.from('credits_by_store')   // chờ ✅

  // 2. Sequential RPC calls — CRITICAL BOTTLENECK
  const { data: interestRowsR } = await supabase.rpc('get_paid_interest',   // chờ ⚠️
    { p_credit_ids: allIds, p_start_date, p_end_date });

  const { data: interestRowsT } = await supabase.rpc('get_paid_interest',    // chờ ⚠️
    { p_credit_ids: allIds });  // ← duplicate call, same function, khác params

  const { data: principalRows } = await supabase.rpc('get_current_principal',// chờ ⚠️
    { p_credit_ids: allIds });

  const { data: debtRows } = await supabase.rpc('get_old_debt',              // chờ ⚠️
    { p_credit_ids: activeIds });

  const { data: expRows } = await supabase.rpc('get_expected_interest',      // chờ ⚠️
    { p_credit_ids: allIds });

  const { data: latestPaidRows } = await supabase.rpc('get_latest_payment_paid_dates', // chờ ⚠️
    { p_credit_ids: allIds });

  const { data: npRows } = await supabase.rpc('get_next_payment_info',      // chờ ⚠️
    { p_credit_ids: activeIds });

  // 3. Cuối cùng mới chạy Promise.all (quá muộn)
  const results = await Promise.all(
    [...activeCreditsData, ...closedCreditsData].map(c => calculateCreditMetrics(...))
  );
}
```

Đồng thời `useCreditsSummary` chạy **4 RPCs riêng** song song:
- `get_current_principal`
- `get_old_debt`
- `get_expected_interest`
- `get_paid_interest`

### Root Cause

1. **7 round-trips network tuần tự** → 7 × latency Supabase (~50-100ms) = **350-700ms**
2. **`get_paid_interest` bị gọi 2 lần** với 2 params khác nhau (date-range vs total) — có thể gộp thành 1
3. **Tất cả financial data đều không cache** → mỗi navigation = tính lại từ đầu

### Solutions

**Option A — Quick Fix (Priority 1):**
```typescript
// Gộp 2 get_paid_interest thành 1 RPC trả về cả range và total
// Thêm get_current_principal, get_old_debt, get_expected_interest,
// get_latest_payment_paid_dates, get_next_payment_info vào 1 function:
// → public.get_credit_financial_summary(p_credit_ids uuid[], p_start_date, p_end_date)
```

**Option B — Medium Fix (Priority 2):**
```typescript
// Dùng Promise.all cho các RPC không phụ thuộc nhau
const [principalData, debtData, expData, latestPaidData, nextData] = await Promise.all([
  supabase.rpc('get_current_principal', { p_credit_ids: allIds }),
  supabase.rpc('get_old_debt', { p_credit_ids: activeIds }),
  supabase.rpc('get_expected_interest', { p_credit_ids: allIds }),
  supabase.rpc('get_latest_payment_paid_dates', { p_credit_ids: allIds }),
  supabase.rpc('get_next_payment_info', { p_credit_ids: activeIds }),
]);
```

**Option C — Long Term:**
- Tạo `credit_financial_snapshot` table, cập nhật trigger khi có transaction → financial data = 1 query đơn giản
- Dùng Materialized View với `REFRESH CONCURRENTLY`

### Trade-off

| Option | Effort | Performance Gain | Risk |
|--------|--------|-----------------|------|
| A: Merge RPC | Medium | ~200-300ms | Low — tạo new RPC, không sửa cũ |
| B: Promise.all | Low | ~100-150ms | Very Low |
| C: Snapshot table | High | ~80-90% improvement | Cần migration + trigger logic |

---

## 🔴 BOTTLENECK 2: Thiếu Composite Index trên History Tables

**Severity:** 🔴 CRITICAL
**Estimated Impact:** ~200-400ms trên mỗi query history
**Files:**
- `schema.sql`
- `rpc_function_supabase_credits.sql`
- `rpc_function_supabase_pawns.sql`
- `rpc_function_supabase_installments.sql`

### Vấn đề

Kiểm tra index hiện có cho `credit_history`:

```sql
-- Có:
idx_credit_amount_history_credit_id  -- trên credit_id ✅
idx_pawn_amount_history_employee_id  -- trên created_by ✅

-- THIẾU (CRITICAL):
-- index trên (credit_id, transaction_type, is_deleted, effective_date DESC)
```

**`credits_by_store` view** chạy subquery mỗi lần được access:

```sql
CREATE OR REPLACE VIEW "public"."credits_by_store" AS
SELECT "c"."id", ...,
  CASE
    WHEN ("lp"."latest_payment_date" IS NULL) THEN ...
    ELSE ...
  END AS "next_payment_date",
  ...
FROM ("public"."credits" "c"
  LEFT JOIN (
    SELECT "credit_history"."credit_id",
      ("max"("credit_history"."effective_date"))::"date" AS "latest_payment_date"
    FROM "public"."credit_history"
    WHERE ("credit_history"."transaction_type" = 'payment' ::...)
      AND ("credit_history"."is_deleted" = false)
    GROUP BY "credit_history"."credit_id"
  ) "lp" ON ...
);
```

Với hàng chục nghìn rows trong `credit_history`, `max(effective_date)` **full table scan** mỗi khi:
- View được SELECT (mỗi page load)
- RPC `get_paid_interest` (dòng 50-63): `WHERE transaction_type = 'payment' AND is_deleted = false AND credit_id = any(p_credit_ids)`
- RPC `get_old_debt` (dòng 287-289): `WHERE transaction_type = 'payment' AND is_deleted = false AND credit_id = any(p_credit_ids)`
- RPC `get_next_payment_info` (dòng 343-345): `WHERE transaction_type = 'payment' AND is_deleted = false`

Tương tự cho `pawn_history` và `installment_history`.

### Solutions

```sql
-- Migration file: sql/add_history_composite_indexes.sql

-- Credit history — phục vụ tất cả RPC functions và view
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credit_history_composite
  ON credit_history (credit_id, transaction_type, is_deleted, effective_date DESC);

-- Pawn history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pawn_history_composite
  ON pawn_history (pawn_id, transaction_type, is_deleted, effective_date DESC);

-- Installment history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_installment_history_composite
  ON installment_history (installment_id, transaction_type, is_deleted, effective_date DESC);

-- Additional: index trên created_at cho store_fund_history, transactions (dashboard usage)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credit_history_created_at
  ON credit_history (created_at DESC) WHERE is_deleted = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pawn_history_created_at
  ON pawn_history (created_at DESC) WHERE is_deleted = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_installment_history_created_at
  ON installment_history (created_at DESC) WHERE is_deleted = false;
```

### Trade-off

| Aspect | Detail |
|--------|--------|
| **Effort** | Very Low — chạy `CREATE INDEX CONCURRENTLY` |
| **Performance Gain** | ~200-400ms improvement trên tất cả queries liên quan history |
| **Risk** | Very Low — index không lock table (CONCURRENTLY flag) |
| **Storage** | Thêm ~50-200MB tùy table size |
| **Side Effect** | Write slightly slower (INSERT/UPDATE có thêm index maintenance) |

---

## 🟠 BOTTLENECK 3: Financial Calculations Không Dùng React Query Cache

**Severity:** 🟠 HIGH
**Estimated Impact:** Cache miss on every navigation, redundant fetches
**Files:**
- `src/hooks/useCreditCalculations.ts` — KHÔNG dùng React Query
- `src/hooks/useCreditsSummary.ts` — KHÔNG dùng React Query
- `src/app/credits/page.tsx` (dòng 129-145) — `fetchTotals` không cache
- `src/lib/react-query-client.ts` — `staleTime: 2min` nhưng **không ai dùng**

### Vấn đề

```
User vào /credits
  ├── useCredits → React Query (có) ✅
  │   └── nhưng lấy từ credits_by_store view (bị BOTTLENECK 2 ảnh hưởng)
  ├── useCreditCalculations → ⚠️ GỌI TRỰC TIẾP MỖI LẦN MOUNT
  │   └── 7 RPCs tuần tự, không cache
  ├── useCreditsSummary → ⚠️ GỌI TRỰC TIẾP MỖI LẦN MOUNT
  │   └── 4 RPCs, không cache
  └── fetchTotals (RPC credit_get_totals) → ⚠️ GỌI TRỰC TIẾP
      └── không cache
```

**Hệ quả:**
- Navigate giữa các trang (credits ↔ pawns ↔ installments) → **fetch lại tất cả từ đầu**
- User click "Refresh" → fetch lại toàn bộ
- Mutation (payment, close contract) → manual `refetch()` gọi lại cả chain
- `staleTime: 2min` trong `react-query-client.ts` → **vô dụng** vì không ai dùng `useQuery`

### Solutions

**Step 1: Wrap useCreditCalculations bằng useQuery**

```typescript
// src/hooks/useCreditCalculations.ts
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

export function useCreditCalculations() {
  const { currentStore } = useStore();

  const query = useQuery({
    queryKey: queryKeys.credits.summary(currentStore?.id),
    queryFn: fetchAllData, // existing fetchAllData logic
    enabled: !!currentStore?.id,
    staleTime: 30 * 1000,     // 30s — balance giữa fresh data và performance
    gcTime: 5 * 60 * 1000,   // 5min
    refetchOnWindowFocus: false,
  });

  return { summary: query.data?.summary, details: query.data?.details, loading: query.isLoading, refresh: query.refetch };
}
```

**Step 2: Tối ưu queryKeys để hỗ trợ credits summary**

```typescript
// src/lib/query-keys.ts — đã có structure sẵn, chỉ cần thêm implementation
// credits.summary(storeId) đã tồn tại ở dòng 58-59
```

**Step 3: Invalidate on mutation**

```typescript
// Trong các mutation handlers (payment, close contract, etc.)
import { queryKeys } from '@/lib/query-keys';

const queryClient = useQueryClient();
queryClient.invalidateQueries({
  queryKey: queryKeys.credits.summary(currentStore?.id)
});
// Tự động refetch khi có mutation
```

### Trade-off

| Aspect | Detail |
|--------|--------|
| **Effort** | Medium — refactor 2 hooks + invalidate calls |
| **Performance Gain** | Navigation cache hit → 0ms fetch thay vì ~500ms |
| **Risk** | Low — React Query handle race conditions, stale data tự động |
| **UX Improvement** | Instant navigation giữa các trang |

---

## 🟠 BOTTLENECK 4: Dashboard — Sequential Loop + Over-fetching

**Severity:** 🟠 HIGH
**Estimated Impact:** ~500-800ms
**Files:**
- `src/app/dashboard/page.tsx` (dòng 103-467)

### Vấn đề

**3 main fetches**, mỗi cái có vấn đề riêng:

#### 4.1. `fetchChartData` — Sequential Loop (dòng 185-264)

```typescript
// Vấn đề: 3 tháng × 2 vòng Promise.all = 6 batches, chạy tuần tự
for (let i = 2; i >= 0; i--) {
  const monthDate = subMonths(now, i);
  // Mỗi iteration: 2 Promise.all × 3 queries = 6 queries
  const [pawnLoans, creditLoans, installmentLoans] = await Promise.all([...]) // 3 queries
  const [pawnHistory, creditHistory, installmentHistory] = await Promise.all([...]) // 3 queries
}
// Tổng: 3 iterations × 6 = 18 network requests
```

**Tốt hơn:** 1 query cho tất cả 3 tháng:

```sql
-- 1 RPC cho chart data
SELECT
  date_trunc('month', loan_date) as month,
  sum(pawn.loan_amount) as pawn_loan,
  sum(credit.loan_amount) as credit_loan,
  sum(installment.installment_amount) as installment_loan
FROM ...
WHERE loan_date >= (now() - interval '3 months')
GROUP BY date_trunc('month', loan_date);
```

#### 4.2. `fetchRecentTransactions` — Over-fetching (dòng 351-412)

```typescript
// Lấy 50 rows từ 5 tables = 250 rows → chỉ hiển thị 10 rows
.limit(50) // → nên là .limit(10) cho initial load
```

Các join `pawns!inner(contract_code, store_id, customers(name), collateral_detail)` có thể gây **exploding join** nếu 1 pawn có nhiều history rows.

#### 4.3. `fetchStats` — Tripled RPC (dòng 115-144)

Gọi `getPawnFinancialsForStore`, `getCreditFinancialsForStore`, `getInstallmentFinancialsForStore` — mỗi cái này có thể chứa nhiều sub-queries/RPCs. Cần verify xem `src/lib/overview.ts` đã dùng Promise.all chưa.

### Solutions

```typescript
// 1. Gộp chart data — 1 query thay vì 18
const fetchChartDataOptimized = async () => {
  const { data } = await supabase.rpc('get_chart_data', {
    p_store_id: currentStore.id,
    p_months: 3
  });
  // trả về array of { month, pawnLoans, creditLoans, installmentLoans, ... }
};

// 2. Giảm limit 50 → 10
.limit(10) // cho initial load

// 3. Verify financials — xem src/lib/overview.ts
```

### Trade-off

| Aspect | Detail |
|--------|--------|
| **Effort** | Medium — cần tạo 1 RPC mới + limit adjustment |
| **Performance Gain** | ~500-800ms (18 requests → 2-3 requests) |
| **Risk** | Low — RPC mới, không ảnh hưởng logic hiện tại |

---

## 🟡 BOTTLENECK 5: TopNavbar Warning Counts — Sequential Queries

**Severity:** 🟡 MEDIUM
**Estimated Impact:** ~100-150ms
**Files:**
- `src/components/Layout/TopNavbar.tsx` (dòng 149-208)

### Vấn đề

```typescript
// src/components/Layout/TopNavbar.tsx — useEffect chạy tuần tự
useEffect(() => {
  const fetchNotificationsForStore = async () => {
    // 3 queries tuần tự — KHÔNG dùng Promise.all
    const { count: overdueInstallments } = await countInstallmentWarnings(currentStore.id); // ⚠️ chờ
    const { count: pawnWarningsCount } = await countPawnWarnings(currentStore.id);          // ⚠️ chờ
    const { count: creditWarningsCount } = await countCreditWarnings(currentStore.id);       // ⚠️ chờ
  };
  fetchNotificationsForStore();
}, [currentStore, storeVersion]);
```

### Solutions

**Quick Fix:**

```typescript
// Trong useEffect
const [overdueInstallments, pawnWarningsCount, creditWarningsCount] = await Promise.all([
  countInstallmentWarnings(currentStore.id),
  countPawnWarnings(currentStore.id),
  countCreditWarnings(currentStore.id),
]);
```

**Long-term Fix:**

```sql
-- Tạo 1 RPC trả về tất cả warning counts trong 1 query
CREATE OR REPLACE FUNCTION public.get_all_warning_counts(p_store_id uuid)
RETURNS TABLE (
  installment_warnings bigint,
  pawn_warnings        bigint,
  credit_warnings      bigint
)
AS $$
  SELECT
    (SELECT count(*) FROM installments_by_store
     WHERE store_id = p_store_id AND status_code = 'OVERDUE'),
    (SELECT count(*) FROM pawns_by_store
     WHERE store_id = p_store_id AND status_code IN ('OVERDUE','LATE_INTEREST')),
    (SELECT count(*) FROM credits_by_store
     WHERE store_id = p_store_id AND status_code IN ('OVERDUE','LATE_INTEREST'));
$$ LANGUAGE SQL STABLE;
```

### Trade-off

| Aspect | Detail |
|--------|--------|
| **Effort** | Low (Promise.all) hoặc Medium (RPC gộp) |
| **Performance Gain** | ~100-150ms → ~30-50ms |
| **Risk** | Very Low |

---

## Appendix A: Các Index Cần Thêm

```sql
-- sql/add_critical_indexes.sql

-- === CRITICAL: History tables composite indexes ===

-- Credit history — phục vụ tất cả RPC và views
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credit_history_composite
  ON credit_history (credit_id, transaction_type, is_deleted, effective_date DESC);

-- Pawn history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pawn_history_composite
  ON pawn_history (pawn_id, transaction_type, is_deleted, effective_date DESC);

-- Installment history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_installment_history_composite
  ON installment_history (installment_id, transaction_type, is_deleted, effective_date DESC);

-- === HIGH: Dashboard usage ===
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credit_history_created
  ON credit_history (created_at DESC) WHERE is_deleted = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pawn_history_created
  ON pawn_history (created_at DESC) WHERE is_deleted = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_installment_history_created
  ON installment_history (created_at DESC) WHERE is_deleted = false;

-- === MEDIUM: Additional coverage ===
-- effective_date cho các RPC date-range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credit_history_effective_date
  ON credit_history (effective_date DESC) WHERE is_deleted = false AND transaction_type = 'payment';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pawn_history_effective_date
  ON pawn_history (effective_date DESC) WHERE is_deleted = false AND transaction_type = 'payment';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_installment_history_effective_date
  ON installment_history (effective_date DESC) WHERE is_deleted = false AND transaction_type = 'payment';
```

---

## Appendix B: Recommended RPC Consolidations

### New RPC: `get_credit_financial_summary`

```sql
CREATE OR REPLACE FUNCTION public.get_credit_financial_summary(
  p_credit_ids uuid[],
  p_active_ids uuid[],
  p_start_date timestamptz DEFAULT NULL,
  p_end_date   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  credit_id          uuid,
  current_principal  numeric,
  old_debt           numeric,
  expected_profit    numeric,
  interest_today     numeric,
  paid_interest      numeric,
  paid_interest_range numeric,
  latest_paid_date   date,
  next_date          date,
  is_completed       boolean,
  has_paid           boolean
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  WITH
    ids AS (SELECT unnest(p_credit_ids) AS id),
    active_ids AS (SELECT unnest(p_active_ids) AS id),
    principal AS (
      SELECT ch.credit_id,
        c.loan_amount + SUM(
          CASE WHEN ch.transaction_type = 'additional_loan'
               THEN COALESCE(ch.debit_amount, 0)
               WHEN ch.transaction_type = 'principal_repayment'
               THEN -COALESCE(ch.credit_amount, 0)
               ELSE 0 END
        ) AS current_principal
      FROM credit_history ch
      JOIN credits c ON c.id = ch.credit_id
      WHERE ch.transaction_type IN ('additional_loan', 'principal_repayment')
        AND ch.is_deleted = false
        AND ch.credit_id = ANY(p_credit_ids)
      GROUP BY ch.credit_id, c.loan_amount
    ),
    latest_pay AS (
      SELECT credit_id,
        MAX(effective_date::date) AS last_paid
      FROM credit_history
      WHERE transaction_type = 'payment'
        AND is_deleted = false
        AND credit_id = ANY(p_active_ids)
      GROUP BY credit_id
    )
  SELECT
    ids.id,
    COALESCE(pr.current_principal, c.loan_amount),
    -- old_debt (simplified)
    0::numeric,
    -- expected_profit, interest_today
    public.calc_expected_until(ids.id, (c.loan_date::date + (c.loan_period - 1))) AS expected_profit,
    CASE WHEN CURRENT_DATE >= c.loan_date::date
         THEN public.calc_expected_until(ids.id, CURRENT_DATE)
              - COALESCE(public.calc_expected_until(ids.id, lp.last_paid_date), 0)
         ELSE 0 END AS interest_today,
    -- paid_interest total
    COALESCE((
      SELECT SUM(ch.credit_amount)
      FROM credit_history ch
      WHERE ch.credit_id = ids.id
        AND ch.transaction_type = 'payment'
        AND ch.is_deleted = false
    ), 0),
    -- paid_interest range
    COALESCE((
      SELECT SUM(ch.credit_amount)
      FROM credit_history ch
      WHERE ch.credit_id = ids.id
        AND ch.transaction_type = 'payment'
        AND ch.is_deleted = false
        AND (p_start_date IS NULL OR ch.created_at >= p_start_date)
        AND (p_end_date IS NULL OR ch.created_at <= p_end_date)
    ), 0),
    -- latest_paid_date
    lp.last_paid_date,
    -- next_date
    CASE WHEN lp.last_paid IS NULL
         THEN c.loan_date + ((COALESCE(c.interest_period, 30) - 1) * INTERVAL '1 day')
         ELSE lp.last_paid + (COALESCE(c.interest_period, 30) * INTERVAL '1 day')
    END::date,
    -- is_completed
    (lp.last_paid IS NOT NULL AND lp.last_paid >= (c.loan_date + ((c.loan_period - 1) * INTERVAL '1 day'))::date),
    -- has_paid
    (lp.last_paid IS NOT NULL)
  FROM ids
  JOIN credits c ON c.id = ids.id
  LEFT JOIN principal pr ON pr.credit_id = ids.id
  LEFT JOIN latest_pay lp ON lp.credit_id = ids.id;
END;
$$;
```

---

## Appendix C: React Query Integration Checklist

```typescript
// 1. useCreditCalculations → useQuery
// Key: queryKeys.credits.summary(currentStore?.id)
// staleTime: 30s, gcTime: 5min

// 2. useCreditsSummary → useQuery
// Key: queryKeys.credits.summary(currentStore?.id)
// → CÓ THỂ GỘP CHUNG với useCreditCalculations

// 3. fetchTotals (credits/page.tsx) → useQuery
// Key: queryKeys.credits.totals(currentStore?.id, JSON.stringify(filters))

// 4. Invalidation points:
// - payment mutation → invalidate credits.list, credits.summary, credits.totals
// - close contract mutation → invalidate credits.summary
// - create/delete credit → invalidate credits.list, credits.summary
```

---

## Appendix D: Performance Measurement Guide

Sau khi apply fixes, measure bằng cách:

```typescript
// Thêm timing vào console (development)
const measureTime = (label: string) => {
  if (process.env.NODE_ENV !== 'development') return;
  const start = performance.now();
  return () => console.log(`[PERF] ${label}: ${(performance.now() - start).toFixed(2)}ms`);
};

// Sử dụng:
const t = measureTime('fetchAllData');
await fetchAllData();
t?.();
```

Hoặc dùng **Supabase Dashboard → SQL Editor → EXPLAIN ANALYZE** để verify index usage:

```sql
EXPLAIN ANALYZE
SELECT max(effective_date) FROM credit_history
WHERE transaction_type = 'payment'
  AND is_deleted = false
  AND credit_id = 'your-test-uuid';
```

**Expected result sau khi thêm index:** `Index Scan` thay vì `Seq Scan`

---

*Document được tạo cho team review và lập kế hoạch sprint optimization.*
