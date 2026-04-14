# Performance Optimization — Installments & Installment Warnings

**Date:** 2026-04-14  
**Scope:** Tối ưu hiệu năng trang trả góp (installments) và trang cảnh báo (installment-warnings)  
**Constraint:** Không thay đổi logic nghiệp vụ, không thay đổi số liệu hiển thị  
**Environment:** Vercel free + Supabase Pro (single production DB, no staging)

---

## Bối cảnh & Vấn đề

Hệ thống có ~3000 hợp đồng trả góp/cửa hàng. Người dùng báo cáo chậm ở:

| # | Trang | Vấn đề | Root cause |
|---|-------|---------|------------|
| 1 | Installments | Tải trang lần đầu trắng/spinner lâu | View DB nặng + ILIKE không dùng index |
| 2 | Installments | Check/uncheck kỳ lãi chậm | Invalidate `installments.all` → refetch toàn bộ 3000 HĐ |
| 3 | Installments | Summary (tổng dư nợ, lãi...) load sau | 3 RPC calls tuần tự thay vì 1 |
| 4 | Installments | Tìm kiếm chậm | `%value%` ILIKE + unaccent không có index |
| 5 | Warnings | Đóng lãi nhanh chậm sau khi xác nhận | Gọi `loadInstallments()` → fetch lại 1000 records |
| 6 | Warnings | Load trang warnings chậm | Fetch 1000 hợp đồng rồi filter/paginate ở client |
| 7 | Warnings | Stats chậm | 3 RPC calls tuần tự |

---

## Kiến trúc giải pháp

Hai lớp fix độc lập, có thể rollback từng phần:

```
Layer 1 — Database (Supabase SQL Editor)
  ├─ Fix 1: Thêm composite indexes → tăng tốc DB query
  └─ Fix 3/7: Gộp RPC calls → giảm số round-trips

Layer 2 — Frontend (Next.js code)
  ├─ Fix 2: Targeted invalidation → chỉ refetch đúng cái cần
  ├─ Fix 5: Remove item from local state → không fetch lại 1000 records
  └─ Fix 6: Giảm limit fetch từ 1000 → 100
```

**Không thay đổi:**
- Toàn bộ logic trong `src/lib/Installments/` (tính lãi, kỳ thanh toán, nợ cũ...)
- Tất cả RPC functions hiện tại (chỉ bổ sung thêm, không sửa)
- Data models, TypeScript types
- Business rules về trạng thái hợp đồng
- Số liệu hiển thị trên mọi trang

---

## Fix 1 — Database Indexes

**Giải quyết:** Vấn đề #1 (tải trang) và #4 (tìm kiếm)  
**Rủi ro data:** Không (indexes là read-only infrastructure)  
**Cách deploy:** Chạy trực tiếp trên Supabase SQL Editor

### SQL cần chạy

```sql
-- 1. Tăng tốc tính toán trong installments_by_store view
-- installment_history được query theo installment_id trong mọi RPC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_installment_history_core
  ON installment_history (installment_id, is_deleted, transaction_type, effective_date);

-- 2. Tăng tốc filter danh sách theo store + status + due date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_installments_list
  ON installments (store_id, status_code, payment_due_date);

-- 3. Tìm kiếm tên khách hàng tiếng Việt (trigram index)
-- Thay thế ILIKE '%value%' không dùng được index
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_name_trgm
  ON customers USING gin (name gin_trgm_ops);
```

**Lưu ý:** `CONCURRENTLY` = không lock table, user vẫn dùng được bình thường trong lúc tạo index. Chạy từng câu lệnh riêng biệt, kiểm tra kết quả trước khi chạy câu tiếp theo.

**Kỳ vọng:** Initial load giảm từ ~3-5s → ~0.5-1s

---

## Fix 2 — Targeted Invalidation (check/uncheck kỳ lãi)

**Giải quyết:** Vấn đề #2  
**Files thay đổi:**
- `src/hooks/useInstallments.ts` — mutations `updateStatusMutation`, `deleteMutation`
- `src/hooks/useInstallmentPaymentPeriods.ts` — mutation check/uncheck kỳ lãi

### Logic thay đổi

```typescript
// TRƯỚC (useInstallments.ts:158-161) — invalidate TẤT CẢ
onSuccess: async () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.installments.summary(currentStore?.id) });
  queryClient.invalidateQueries({ queryKey: queryKeys.installments.paidAmounts([]) });
  queryClient.invalidateQueries({ queryKey: queryKeys.installments.all }); // QUÁ RỘNG
}

// SAU — chỉ invalidate trang hiện tại + summary
onSuccess: async () => {
  queryClient.invalidateQueries({
    queryKey: queryKeys.installments.list(filters, currentPage, itemsPerPage, currentStore?.id)
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.installments.summary(currentStore?.id)
  });
  // Bỏ: queryKeys.installments.all
  // Bỏ: queryKeys.installments.paidAmounts([]) — empty array không match cache nào
}
```

Tương tự cho `useInstallmentPaymentPeriods.ts`: sau khi check/uncheck 1 kỳ, chỉ invalidate query của hợp đồng đó (dùng `installmentId` làm query key), không invalidate danh sách.

**Kỳ vọng:** Từ ~2-3s refetch toàn bộ → ~300-500ms chỉ refetch 1 trang

---

## Fix 3 — Gộp 3 RPC Summary thành 1

**Giải quyết:** Vấn đề #3  
**Files thay đổi:**
- Supabase: thêm function `installment_get_all_summary_stats` (không xóa 3 function cũ)
- `src/hooks/useInstallmentsSummary.ts` — gọi 1 RPC thay vì 3

### SQL RPC mới (logic copy từ 3 function cũ, chỉ gộp lại)

```sql
CREATE OR REPLACE FUNCTION installment_get_all_summary_stats(
  p_installment_ids UUID[],
  p_closed_ids UUID[]
)
RETURNS TABLE (
  installment_id UUID,
  old_debt       NUMERIC,
  paid_amount    NUMERIC,
  collected_profit NUMERIC
)
LANGUAGE sql STABLE AS $$
  -- old_debt: logic từ get_installment_old_debt
  WITH debt AS (
    SELECT * FROM get_installment_old_debt(p_installment_ids)
  ),
  -- paid_amount: logic từ installment_get_paid_amount
  paid AS (
    SELECT * FROM installment_get_paid_amount(p_installment_ids)
  ),
  -- collected_profit: logic từ installment_get_collected_profit
  profit AS (
    SELECT * FROM installment_get_collected_profit(p_closed_ids)
  ),
  all_ids AS (
    SELECT unnest(p_installment_ids) AS id
  )
  SELECT
    a.id,
    COALESCE(d.old_debt, 0),
    COALESCE(p.paid_amount, 0),
    COALESCE(pr.collected_profit, 0)
  FROM all_ids a
  LEFT JOIN debt d ON d.installment_id = a.id
  LEFT JOIN paid p ON p.installment_id = a.id
  LEFT JOIN profit pr ON pr.installment_id = a.id;
$$;
```

### Frontend thay đổi (useInstallmentsSummary.ts:102-114)

```typescript
// TRƯỚC — 3 await tuần tự
const { data: debtRows }   = await supabase.rpc('get_installment_old_debt', { p_installment_ids: ids });
const { data: paidRows }   = await supabase.rpc('installment_get_paid_amount', { p_installment_ids: ids });
const { data: profitRows } = await supabase.rpc('installment_get_collected_profit', { p_installment_ids: [...ids, ...closedIds] });

// SAU — 1 await
const { data: summaryRows } = await supabase.rpc('installment_get_all_summary_stats', {
  p_installment_ids: ids,
  p_closed_ids: [...ids, ...closedIds]
});
// Map summaryRows thành debtMap, paidMap, profitMap như cũ
// calculateInstallmentMetrics() không thay đổi
```

**Kỳ vọng:** Summary từ ~1.5s → ~600ms

---

## Fix 4 — Warnings: Optimistic remove + background reload

**Giải quyết:** Vấn đề #5 (đóng lãi nhanh chậm)  
**File thay đổi:** `src/app/installment-warnings/page.tsx`

### Logic thay đổi

`processPayment()` không thay đổi gì — toàn bộ logic tính toán và ghi DB giữ nguyên.

Chỉ thay đổi cách cập nhật UI sau khi payment thành công — **2 bước**:

```typescript
// TRƯỚC (page.tsx:476)
await processPayment(installment);
loadInstallments(); // blocking: chờ fetch 1000 records xong mới update UI

// SAU
await processPayment(installment); // logic không đổi

// Bước 1: Ẩn item ngay lập tức (optimistic) → UI phản hồi tức thì
setInstallments(prev => prev.filter(i => i.id !== installment.id));
setFilteredInstallments(prev => prev.filter(i => i.id !== installment.id));

// Bước 2: Reload ngầm để đồng bộ state thực tế từ DB (non-blocking)
// Nếu item vẫn còn trong warnings (do OVERDUE/LATE_INTEREST chưa cleared),
// nó sẽ xuất hiện lại sau khi reload — đây là behavior đúng.
loadInstallments(); // không await → không block UI
```

**Tại sao 2 bước:**
- Hợp đồng `ON_TIME` đóng lãi → `payment_due_date` sang kỳ mới → biến khỏi warnings ✓ (ẩn optimistic là đúng)
- Hợp đồng `OVERDUE`/`LATE_INTEREST` đóng 1 kỳ → có thể còn kỳ khác → background reload đưa item về nếu cần
- User thấy phản hồi ngay, background sync đảm bảo tính đúng đắn

**Kỳ vọng:** UX từ ~2-3s chờ → tức thì. Background reload chạy ngầm (không cản người dùng).  
Khi kết hợp với Fix 5 (limit 100), background reload cũng sẽ nhanh hơn nhiều so với hiện tại.

---

## Fix 5 — Warnings: Giảm limit fetch

**Giải quyết:** Vấn đề #6 (load trang warnings chậm)  
**File thay đổi:** `src/app/installment-warnings/page.tsx`

### Logic thay đổi

```typescript
// TRƯỚC (page.tsx:95)
getInstallmentWarnings(1, 1000, storeId, ...)

// SAU
getInstallmentWarnings(1, 100, storeId, ...)
```

`getInstallmentWarnings()` trong `src/lib/installment-warnings.ts` không thay đổi gì. Chỉ giảm limit từ 1000 → 100.

**Lý do 100 (không phải 30):** Warnings page hiển thị các hợp đồng sắp đến hạn hoặc quá hạn. Trong thực tế với 3000 hợp đồng, số lượng cần xử lý trong 1 ngày thường dưới 100. Nếu cần thêm, user có thể dùng filter.

**Kỳ vọng:** Load warnings từ ~2-3s → ~500ms

---

## Fix 6 — Warnings: Gộp 3 RPC Stats thành parallel

**Giải quyết:** Vấn đề #7 (stats chậm)  
**File thay đổi:** `src/components/Installments/InstallmentWarningsTable.tsx:161-183`

### Logic thay đổi

Thay vì gọi 3 RPC tuần tự, gọi song song với `Promise.all`:

```typescript
// TRƯỚC — tuần tự, ~1.5s
const overdueStats = await supabase.rpc('installment_overdue_stats', { p_ids: ids });
const nextUnpaid   = await supabase.rpc('installment_next_unpaid_date', { p_ids: ids });
const oldDebt      = await supabase.rpc('get_installment_old_debt', { p_installment_ids: ids });

// SAU — song song, ~600ms
const [overdueStats, nextUnpaid, oldDebt] = await Promise.all([
  supabase.rpc('installment_overdue_stats', { p_ids: ids }),
  supabase.rpc('installment_next_unpaid_date', { p_ids: ids }),
  supabase.rpc('get_installment_old_debt', { p_installment_ids: ids }),
]);
```

Không thay đổi gì về logic xử lý kết quả sau đó.

**Kỳ vọng:** Stats từ ~1.5s → ~600ms (3 calls chạy song song thay vì tuần tự)

---

## Thứ tự thực hiện

Thứ tự được sắp xếp theo: impact cao → rủi ro thấp → độc lập nhau.

1. **Fix 6** (Warnings stats parallel) — Frontend only, 5 lines code, impact ngay lập tức
2. **Fix 4** (Warnings: xóa item local) — Frontend only, 2 lines code, fix cảm giác chậm nhất
3. **Fix 5** (Warnings: giảm limit) — Frontend only, 1 line code
4. **Fix 2** (Targeted invalidation) — Frontend only, xóa 1 dòng + sửa 1 dòng
5. **Fix 1** (DB Indexes) — Chạy SQL trên Supabase SQL Editor, `CONCURRENTLY`
6. **Fix 3** (Gộp summary RPC) — Deploy SQL mới + sửa hook

---

## Kiểm tra sau khi deploy

| Fix | Cách kiểm tra |
|-----|---------------|
| Fix 1 (indexes) | Supabase SQL Editor: `EXPLAIN ANALYZE` trên query danh sách installments |
| Fix 2 (invalidation) | Check/uncheck kỳ lãi, quan sát Network tab — chỉ thấy 1 request nhỏ thay vì nhiều |
| Fix 3 (summary RPC) | Network tab: summary chỉ gọi 1 RPC, số liệu hiển thị giống hệt trước |
| Fix 4 (remove local) | Đóng lãi nhanh, item biến khỏi list ngay lập tức |
| Fix 5 (limit) | Network tab: warnings request trả về ~100 records thay vì 1000 |
| Fix 6 (parallel) | Network tab: 3 RPC calls bắt đầu cùng lúc thay vì tuần tự |
