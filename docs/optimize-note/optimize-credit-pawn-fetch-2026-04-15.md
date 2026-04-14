# Tối ưu fetch & render — Credits / Pawns

**Ngày:** 2026-04-15  
**Phạm vi:** Giảm round-trip Supabase, tránh re-fetch/spam, tối ưu render bảng; giữ nguyên logic nghiệp vụ.

---

## 1. Màn Pawns (`src/app/pawns/page.tsx`)

| Thay đổi | Mục đích |
|----------|----------|
| `usePawnsSummary({ autoFetch: false })`, `usePawnCalculations({ autoFetch: false })` | Tránh mỗi hook tự fetch khi mount; page điều phối một lần |
| `refreshPawnsScreenData` + `Promise.allSettled([refetch, refreshSummary, refreshPawnDetails, fetchTotals])` | Các request refresh không block nhau; một cổng refresh |
| `fetchTotals` / `refreshPawnsScreenData` bọc `useCallback`; dependency ổn định | Tránh `useEffect` kích hoạt lặp do identity callback đổi |
| `refetch` trong `usePawns` bọc `useCallback` | Tránh vòng lặp effect → spam API |
| `onSuccess` create/edit modal gọi `handleRefresh()` thay vì chỉ `refetch()` | Đồng bộ summary + totals + chi tiết |
| `useAutoUpdateCashFund`: `onUpdate` no-op nếu đã refresh sau thao tác | Giảm refresh trùng sau `triggerUpdate` |
| Bỏ `console.log(pawns)` | Giảm overhead render khi list lớn |

---

## 2. Hook Pawns

| File | Thay đổi |
|------|----------|
| `src/hooks/usePawnsSummary.ts` | `autoFetch?: boolean` (mặc định `true`); `fetchSummary` dùng `useCallback`; 3 query đầu (`stores`, `pawns_by_store` active/closed) chạy **song song** bằng `Promise.all` |
| `src/hooks/usePawnCalculation.ts` | `autoFetch?: boolean`; `fetchAllData` dùng `useCallback` |
| `src/hooks/usePawns.ts` | `refetch` = `useCallback(() => fetchPawns(), [fetchPawns])` |

---

## 3. Bảng Pawns (`src/components/Pawns/PawnTable.tsx`)

| Thay đổi | Mục đích |
|----------|----------|
| `Intl.NumberFormat` memo một lần (`useMemo`) | Không tạo formatter mỗi cell |
| `formatCurrency`, `formatDate`, `handleContractCodeClick`, `handleUnlockPawn` → `useCallback` | Giảm re-render không cần thiết |
| `rowViewModels` (`useMemo`) | Precompute STT, chi tiết tài chính, badge trạng thái, ngày đóng, chuỗi lãi — bỏ IIFE trong JSX |
| `canUnlockPawnFromHistory` = một lần `hasPermission(...)` | Không gọi permission trong từng dòng desktop |

---

## 4. Credits — Bottleneck 1 (Sequential RPC chain)

**Tài liệu tham chiếu:** `critical_bottleneck.md` — *Option A: merge RPC*

| Thành phần | Nội dung |
|------------|----------|
| RPC mới | `public.get_credit_financial_summary(p_all_credit_ids, p_active_credit_ids, p_start_date, p_end_date)` → `jsonb` gom: `get_paid_interest` (range + total), `get_current_principal`, `get_old_debt`, `get_expected_interest`, `get_latest_payment_paid_dates`, `get_next_payment_info` |
| SQL nguồn | `sql/20260215_get_credit_financial_summary.sql`, đồng bộ trong `rpc_function_supabase_credits.sql` + `GRANT` |
| Client | `src/hooks/useCreditCalculation.ts`: sau khi có `allIds`/`activeIds`, **một** `supabase.rpc('get_credit_financial_summary', …)` thay cho chuỗi ~7 RPC tuần tự; `Promise.all` cho 3 query `stores` + `credits_by_store` (active + closed) |

**Lưu ý triển khai DB:** Cần chạy migration SQL trên Supabase (hosted/local) trước khi client dùng RPC mới.

---

## 5. Credits Summary (`src/hooks/useCreditsSummary.ts`)

- Gộp các RPC độc lập trong nhánh `activeIds` bằng `Promise.all` (principal / old_debt / expected).
- Đã bỏ timer chi tiết từng bước trong khối try/finally con (code gọn hơn); giữ logic tính tổng.

---

## 6. Các RPC credit vẫn được gọi riêng ở chỗ khác

Các hàm `get_*` vẫn dùng trực tiếp tại (không thay bằng `get_credit_financial_summary`):

- `useCreditsSummary.ts`, `src/lib/overview.ts`
- `src/lib/Credits/calculate_*.ts`, `src/app/reports/profitSummary/page.tsx`
- Trong DB: `credit_get_totals`, view `credits_by_store`, v.v.

Có thể cân nhắc tái sử dụng `get_credit_financial_summary` sau nếu muốn giảm thêm round-trip tại các luồng trùng logic.

---

## 7. Lệnh kiểm tra gợi ý

```bash
npm run build
npm run lint
```

Sau khi áp dụng SQL:

```bash
npm run update-types
```

---

## 8. File liên quan (tham chiếu nhanh)

- `src/app/pawns/page.tsx`
- `src/hooks/usePawns.ts`, `usePawnsSummary.ts`, `usePawnCalculation.ts`
- `src/components/Pawns/PawnTable.tsx`
- `src/hooks/useCreditCalculation.ts`, `useCreditsSummary.ts`
- `sql/20260215_get_credit_financial_summary.sql`
- `rpc_function_supabase_credits.sql`
