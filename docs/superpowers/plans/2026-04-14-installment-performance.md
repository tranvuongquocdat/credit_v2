# Installment Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tối ưu hiệu năng trang trả góp (installments) và cảnh báo (installment-warnings) — giảm thời gian tải trang, check/uncheck kỳ lãi, đóng lãi nhanh — không thay đổi bất kỳ logic nghiệp vụ hay số liệu nào.

**Architecture:** Hai lớp fix độc lập: (1) Frontend — thay sequential awaits bằng Promise.all, bỏ invalidation quá rộng, tối ưu local state sau mutation; (2) Database — thêm composite indexes trên Supabase để tăng tốc query. Mỗi task độc lập, có thể rollback từng phần.

**Tech Stack:** Next.js 15 (App Router), TanStack React Query v5, Supabase (PostgreSQL + RPC), TypeScript

---

## File map

| File | Thay đổi |
|------|----------|
| `src/components/Installments/InstallmentWarningsTable.tsx` | Task 1: 3 sequential RPCs → Promise.all |
| `src/app/installment-warnings/page.tsx` | Task 2: limit 1000→200; Task 3: silent reload + optimistic remove |
| `src/hooks/useInstallments.ts` | Task 4: bỏ `installments.all` invalidation |
| `src/hooks/useInstallmentsSummary.ts` | Task 5: parallel fetch active+closed + 3 RPCs → Promise.all |
| `src/hooks/useInstallmentPaymentPeriods.ts` | Task 6: expose `dailyAmounts` |
| `src/components/Installments/tabs/PaymentTabFast.tsx` | Task 6: dùng cached dailyAmounts |
| Supabase SQL Editor (không phải file code) | Task 7: 3 composite indexes |

---

## Task 1: Parallelize warnings stats RPCs

**Files:**
- Modify: `src/components/Installments/InstallmentWarningsTable.tsx:161-183`

3 RPC calls hiện đang chạy tuần tự (mỗi cái ~500ms → tổng ~1.5s). Chúng độc lập nhau nên có thể chạy song song.

- [ ] **Step 1: Mở file và xác nhận vị trí cần sửa**

  Mở `src/components/Installments/InstallmentWarningsTable.tsx`. Tìm đến dòng 147 — `useEffect` với `async function processWarnings()`. Đây là nơi 3 RPC được gọi tuần tự ở dòng ~161-183.

- [ ] **Step 2: Thay 3 sequential awaits bằng Promise.all**

  Tìm đoạn code này (khoảng dòng 157-184):
  ```typescript
  const { data: lateRows, error: lateErr } = await (supabase as any).rpc('installment_overdue_stats', {
    p_installment_ids: ids,
  });
  if (lateErr) {
    console.error('installment_overdue_stats error:', lateErr);
    return;
  }
  const lateMap = new Map((lateRows as any[]).map((r: any) => [r.installment_id, r.late_periods]));

  /* 2. next unpaid date */
  const { data: nextRows, error: nextErr } = await (supabase as any).rpc('installment_next_unpaid_date', {
    p_installment_ids: ids,
  });
  if (nextErr) {
    console.error('installment_next_unpaid_date error:', nextErr);
    return;
  }
  const nextMap = new Map((nextRows as any[]).map((r: any) => [r.installment_id, r.next_unpaid_date]));

  /* 3. old debt */
  const { data: oldDebtRows, error: oldDebtErr } = await (supabase as any).rpc('get_installment_old_debt', {
    p_installment_ids: ids,
  });
  const oldDebtMap = new Map((oldDebtRows as any[]).map((r: any) => [r.installment_id, r.old_debt]));
  ```

  Thay bằng:
  ```typescript
  /* 1+2+3. Gọi song song 3 RPCs — logic xử lý kết quả giữ nguyên */
  const [
    { data: lateRows, error: lateErr },
    { data: nextRows, error: nextErr },
    { data: oldDebtRows },
  ] = await Promise.all([
    (supabase as any).rpc('installment_overdue_stats', { p_installment_ids: ids }),
    (supabase as any).rpc('installment_next_unpaid_date', { p_installment_ids: ids }),
    (supabase as any).rpc('get_installment_old_debt', { p_installment_ids: ids }),
  ]);

  if (lateErr) {
    console.error('installment_overdue_stats error:', lateErr);
    return;
  }
  if (nextErr) {
    console.error('installment_next_unpaid_date error:', nextErr);
    return;
  }

  const lateMap = new Map((lateRows as any[]).map((r: any) => [r.installment_id, r.late_periods]));
  const nextMap = new Map((nextRows as any[]).map((r: any) => [r.installment_id, r.next_unpaid_date]));
  const oldDebtMap = new Map((oldDebtRows as any[]).map((r: any) => [r.installment_id, r.old_debt]));
  ```

  Toàn bộ code sau đó (xử lý `lateMap`, `nextMap`, `oldDebtMap`) **giữ nguyên hoàn toàn**.

- [ ] **Step 3: Kiểm tra TypeScript compile**

  ```bash
  cd "/Users/dat_macbook/Documents/2025/ý tưởng mới/Dự án web tiền/credit"
  npx tsc --noEmit 2>&1 | head -30
  ```

  Kỳ vọng: không có lỗi TypeScript liên quan đến file vừa sửa.

- [ ] **Step 4: Chạy dev server và kiểm tra trang warnings**

  ```bash
  npm run dev
  ```

  Mở trình duyệt → `http://localhost:3000/installment-warnings` → mở DevTools Network tab → reload trang → kiểm tra 3 RPC calls (`installment_overdue_stats`, `installment_next_unpaid_date`, `get_installment_old_debt`) bắt đầu gần như cùng lúc (timestamp gần nhau) thay vì tuần tự.

  Kiểm tra số liệu hiển thị không thay đổi so với trước.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/Installments/InstallmentWarningsTable.tsx
  git commit -m "perf: parallelize 3 sequential RPC calls in warnings table"
  ```

---

## Task 2: Giảm limit fetch warnings từ 1000 → 200

**Files:**
- Modify: `src/app/installment-warnings/page.tsx:95`

Trang warnings hiện fetch 1000 records cho client-side filtering. Với ~3000 hợp đồng, số lượng warning thực tế trong 1 ngày thường < 100. Giảm xuống 200 để có buffer an toàn.

- [ ] **Step 1: Tìm và sửa dòng fetch limit**

  Trong `src/app/installment-warnings/page.tsx`, tìm hàm `loadInstallments()` (khoảng dòng 86). Trong đó có:
  ```typescript
  const { data, error, totalItems, totalPages } = await getInstallmentWarnings(
    1, // Always fetch from page 1
    1000, // Fetch all records for client-side filtering
    currentStore.id,
    debouncedCustomerFilter,
    debouncedContractFilter,
    employeeFilter === 'all' ? '' : employeeFilter
  );
  ```

  Sửa `1000` thành `200`:
  ```typescript
  const { data, error, totalItems, totalPages } = await getInstallmentWarnings(
    1, // Always fetch from page 1
    200, // Fetch records for client-side filtering
    currentStore.id,
    debouncedCustomerFilter,
    debouncedContractFilter,
    employeeFilter === 'all' ? '' : employeeFilter
  );
  ```

- [ ] **Step 2: Kiểm tra trang warnings vẫn hiển thị đúng**

  Dev server đang chạy → reload `http://localhost:3000/installment-warnings` → kiểm tra:
  - Số liệu hiển thị giống như trước (danh sách hợp đồng cảnh báo)
  - Network tab: request warnings trả về tối đa 200 records thay vì 1000
  - Trang load nhanh hơn rõ rệt

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/installment-warnings/page.tsx
  git commit -m "perf: reduce warnings fetch limit from 1000 to 200 records"
  ```

---

## Task 3: Optimistic remove + silent reload sau đóng lãi nhanh

**Files:**
- Modify: `src/app/installment-warnings/page.tsx`

Hiện tại sau khi đóng lãi nhanh thành công, `loadInstallments()` được gọi → fetch lại toàn bộ (giờ là 200 records) và block UI trong lúc đó. Fix: xóa item khỏi local state ngay (tức thì), reload ngầm không block UI.

- [ ] **Step 1: Thêm tham số `silent` vào `loadInstallments`**

  Tìm hàm `loadInstallments()` (dòng 86). Sửa signature và logic loading:

  ```typescript
  // TRƯỚC:
  async function loadInstallments() {
    if (!currentStore?.id) return;
    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);
    try {
      // ... fetch logic
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }

  // SAU — thêm tham số silent:
  async function loadInstallments(silent = false) {
    if (!currentStore?.id) return;
    const currentRequestId = ++requestIdRef.current;
    if (!silent) setIsLoading(true);
    try {
      // ... fetch logic giữ nguyên hoàn toàn
    } catch (err) {
      // ... error handling giữ nguyên
    } finally {
      if (!silent && currentRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }
  ```

  **Chú ý:** Chỉ sửa 3 chỗ: (1) thêm `silent = false` vào signature, (2) `if (!silent) setIsLoading(true)`, (3) `if (!silent && ...) setIsLoading(false)`. Toàn bộ fetch logic bên trong không thay đổi.

- [ ] **Step 2: Sửa chỗ gọi loadInstallments sau payment thành công**

  Tìm hàm `processPayment` (khoảng dòng 293). Ở cuối hàm, sau toast "Thanh toán thành công" (khoảng dòng 470-476):

  ```typescript
  // TRƯỚC (khoảng dòng 475-476):
  // Reload installments to update the UI
  loadInstallments();

  // SAU — xóa item ngay + reload ngầm:
  // Bước 1: Xóa item khỏi danh sách ngay lập tức (optimistic)
  setInstallments(prev => prev.filter(i => i.id !== installment.id));
  setFilteredInstallments(prev => prev.filter(i => i.id !== installment.id));

  // Bước 2: Reload ngầm không block UI — nếu item vẫn còn warning (OVERDUE/LATE_INTEREST),
  // nó sẽ xuất hiện lại sau khi sync xong. Logic này đúng về mặt nghiệp vụ.
  loadInstallments(true);
  ```

- [ ] **Step 3: Kiểm tra hành vi đóng lãi nhanh**

  Dev server đang chạy → mở `http://localhost:3000/installment-warnings` → chọn 1 hợp đồng có nút đóng lãi nhanh → nhấn nút → kiểm tra:
  - Item biến khỏi danh sách ngay lập tức (không có loading spinner)
  - Sau ~500ms-1s, danh sách tự refresh ngầm (không gây flickering rõ rệt)
  - Số liệu các hợp đồng khác không bị ảnh hưởng

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/installment-warnings/page.tsx
  git commit -m "perf: optimistic remove + silent background reload after quick payment"
  ```

---

## Task 4: Bỏ broad invalidation trong useInstallments

**Files:**
- Modify: `src/hooks/useInstallments.ts:156-174, 212-230`

Cả `updateStatusMutation` và `deleteMutation` đều invalidate `queryKeys.installments.all` sau khi thành công — điều này clear cache của TẤT CẢ trang installments, gây refetch không cần thiết. Đã có optimistic update xử lý UI rồi, không cần broad invalidation nữa.

- [ ] **Step 1: Sửa `updateStatusMutation.onSuccess` (dòng 156-174)**

  Tìm đoạn:
  ```typescript
  onSuccess: async () => {
    // Invalidate related queries to ensure consistency using centralized query keys
    queryClient.invalidateQueries({ queryKey: queryKeys.installments.summary(currentStore?.id) });
    // Invalidate all installment-paid-amounts queries since we don't know the exact installment IDs
    queryClient.invalidateQueries({ queryKey: queryKeys.installments.paidAmounts([]) });
    queryClient.invalidateQueries({ queryKey: queryKeys.installments.all });

    toast({
      title: "Thành công",
      description: "Đã cập nhật trạng thái hợp đồng"
    });

    // Prefetch current page data for faster UI response
    try {
      await prefetchInstallmentsPage(queryClient, filters, currentPage, itemsPerPage, currentStore?.id);
    } catch (error) {
      // Prefetching errors are not critical, ignore them
    }
  },
  ```

  Sửa thành:
  ```typescript
  onSuccess: async () => {
    // Chỉ invalidate summary và trang hiện tại — không invalidate toàn bộ cache
    queryClient.invalidateQueries({ queryKey: queryKeys.installments.summary(currentStore?.id) });
    // Bỏ: paidAmounts([]) — empty array không match cache nào, vô nghĩa
    // Bỏ: installments.all — quá rộng, gây refetch toàn bộ không cần thiết

    toast({
      title: "Thành công",
      description: "Đã cập nhật trạng thái hợp đồng"
    });

    // Prefetch current page data for faster UI response
    try {
      await prefetchInstallmentsPage(queryClient, filters, currentPage, itemsPerPage, currentStore?.id);
    } catch (error) {
      // Prefetching errors are not critical, ignore them
    }
  },
  ```

- [ ] **Step 2: Sửa `deleteMutation.onSuccess` (dòng 212-230)**

  Tìm đoạn tương tự trong `deleteMutation`:
  ```typescript
  onSuccess: async () => {
    // Invalidate related queries to ensure consistency using centralized query keys
    queryClient.invalidateQueries({ queryKey: queryKeys.installments.summary(currentStore?.id) });
    // Invalidate all installment-paid-amounts queries since we don't know the exact installment IDs
    queryClient.invalidateQueries({ queryKey: queryKeys.installments.paidAmounts([]) });
    queryClient.invalidateQueries({ queryKey: queryKeys.installments.all });

    toast({
      title: "Thành công",
      description: "Đã xóa hợp đồng"
    });

    // Prefetch current page data for faster UI response
    try {
      await prefetchInstallmentsPage(queryClient, filters, currentPage, itemsPerPage, currentStore?.id);
    } catch (error) {
      // Prefetching errors are not critical, ignore them
    }
  },
  ```

  Sửa thành:
  ```typescript
  onSuccess: async () => {
    // Chỉ invalidate summary và trang hiện tại
    queryClient.invalidateQueries({ queryKey: queryKeys.installments.summary(currentStore?.id) });
    // Bỏ: paidAmounts([]) và installments.all

    toast({
      title: "Thành công",
      description: "Đã xóa hợp đồng"
    });

    // Prefetch current page data for faster UI response
    try {
      await prefetchInstallmentsPage(queryClient, filters, currentPage, itemsPerPage, currentStore?.id);
    } catch (error) {
      // Prefetching errors are not critical, ignore them
    }
  },
  ```

- [ ] **Step 3: Kiểm tra TypeScript compile**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Kỳ vọng: no errors.

- [ ] **Step 4: Kiểm tra hành vi cập nhật trạng thái**

  Dev server → `http://localhost:3000/installments` → thay đổi trạng thái 1 hợp đồng → kiểm tra:
  - UI update ngay lập tức (optimistic update vẫn hoạt động)
  - Network tab: chỉ thấy request invalidate summary, KHÔNG thấy request refetch toàn bộ danh sách
  - Số liệu summary cập nhật sau ~500ms

- [ ] **Step 5: Commit**

  ```bash
  git add src/hooks/useInstallments.ts
  git commit -m "perf: remove overly broad installments.all cache invalidation after mutations"
  ```

---

## Task 5: Parallelize summary data fetching

**Files:**
- Modify: `src/hooks/useInstallmentsSummary.ts`

Hook này có tổng cộng 5 sequential awaits khi load: 2 fetches từ `installments_by_store` (active + closed), rồi 3 RPC calls. Parallelize những cái độc lập nhau.

- [ ] **Step 1: Parallelize 2 fetches từ installments_by_store**

  Tìm đoạn này (dòng 27-60):
  ```typescript
  // Lấy tất cả hợp đồng chưa bị xóa...
  const { data: activeInstallments, error: installmentsError } = await supabase
    .from('installments_by_store')
    .select(`id, contract_code, down_payment, loan_period, loan_date, installment_amount, status, store_id, debt_amount`)
    .in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST'])
    .eq('store_id', currentStore.id);

  if (installmentsError) { throw installmentsError; }

  // Lấy danh sách hợp đồng đã đóng
  const { data: closedInstallments, error: closedInstallmentsError } = await supabase
    .from('installments_by_store')
    .select('id')
    .eq('status_code', 'CLOSED')
    .eq('store_id', currentStore.id);

  if (closedInstallmentsError) { throw closedInstallmentsError; }
  ```

  Sửa thành (2 fetches chạy song song):
  ```typescript
  // Lấy active và closed installments song song — 2 queries độc lập nhau
  const [
    { data: activeInstallments, error: installmentsError },
    { data: closedInstallments, error: closedInstallmentsError },
  ] = await Promise.all([
    supabase
      .from('installments_by_store')
      .select(`id, contract_code, down_payment, loan_period, loan_date, installment_amount, status, store_id, debt_amount`)
      .in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST'])
      .eq('store_id', currentStore.id),
    supabase
      .from('installments_by_store')
      .select('id')
      .eq('status_code', 'CLOSED')
      .eq('store_id', currentStore.id),
  ]);

  if (installmentsError) { throw installmentsError; }
  if (closedInstallmentsError) { throw closedInstallmentsError; }
  ```

- [ ] **Step 2: Parallelize 3 RPC calls (dòng 101-114)**

  Tìm đoạn:
  ```typescript
  /* 3.1 oldDebt (đã có) */
  const { data: debtRows } = await supabase.rpc(
    'get_installment_old_debt', { p_installment_ids: ids }
  );

  /* 3.2 tổng paid (cho loanAmount) */
  const { data: paidRows } = await supabase.rpc(
    'installment_get_paid_amount', { p_installment_ids: ids }
  );

  /* 3.3 profitCollected ( tính cả hợp đồng đã đóng )  */
  const { data: profitRows } = await supabase.rpc(
    'installment_get_collected_profit', { p_installment_ids: [...ids, ...closedIds] }
  );
  ```

  Sửa thành:
  ```typescript
  /* 3.1 + 3.2 + 3.3 — chạy song song, logic xử lý kết quả giữ nguyên */
  const [
    { data: debtRows },
    { data: paidRows },
    { data: profitRows },
  ] = await Promise.all([
    supabase.rpc('get_installment_old_debt', { p_installment_ids: ids }),
    supabase.rpc('installment_get_paid_amount', { p_installment_ids: ids }),
    supabase.rpc('installment_get_collected_profit', { p_installment_ids: [...ids, ...closedIds] }),
  ]);
  ```

  Toàn bộ code sau đó (xây `debtMap`, `paidMap`, `profitMap`, gọi `calculateInstallmentMetrics`) **giữ nguyên hoàn toàn**.

- [ ] **Step 3: Kiểm tra TypeScript compile**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 4: Kiểm tra số liệu summary không thay đổi**

  Dev server → `http://localhost:3000/installments` → chờ summary load → ghi lại số liệu (tổng dư nợ, lãi, v.v.) → reload lại trang → kiểm tra số liệu giống hệt.

  Network tab: quan sát summary section load nhanh hơn (các requests song song).

- [ ] **Step 5: Commit**

  ```bash
  git add src/hooks/useInstallmentsSummary.ts
  git commit -m "perf: parallelize installments_by_store fetches and 3 summary RPC calls"
  ```

---

## Task 6: Cache dailyAmounts trong PaymentTabFast (giảm 1 DB call khi check kỳ lãi)

**Files:**
- Modify: `src/hooks/useInstallmentPaymentPeriods.ts` — expose `dailyAmounts`
- Modify: `src/components/Installments/tabs/PaymentTabFast.tsx` — dùng cached `dailyAmounts`

Khi user check 1 kỳ lãi, `handleCheckboxChange` gọi `getExpectedMoney(installment.id)` (1 DB query) để lấy daily amounts. Nhưng hook `useInstallmentPaymentPeriods` đã fetch `dailyAmounts` khi load rồi. Lãng phí 1 DB round-trip mỗi lần check. Fix: expose `dailyAmounts` từ hook, dùng cached version.

- [ ] **Step 1: Expose `dailyAmounts` từ `useInstallmentPaymentPeriods`**

  Mở `src/hooks/useInstallmentPaymentPeriods.ts`. Tìm state declarations (khoảng dòng 18-20):
  ```typescript
  const [periods, setPeriods] = useState<InstallmentPaymentPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  ```

  Thêm state cho dailyAmounts:
  ```typescript
  const [periods, setPeriods] = useState<InstallmentPaymentPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dailyAmounts, setDailyAmounts] = useState<number[]>([]);
  ```

  Tìm bên trong hàm `generate()` (khoảng dòng 37):
  ```typescript
  // 2. Daily expected amounts
  const dailyAmounts = await getExpectedMoney(installmentId!);
  ```

  Ngay sau dòng này, thêm:
  ```typescript
  // 2. Daily expected amounts
  const dailyAmounts = await getExpectedMoney(installmentId!);
  if (!isCancelled) setDailyAmounts(dailyAmounts); // Cache để dùng lại
  ```

  Tìm dòng return ở cuối hook (dòng 117):
  ```typescript
  return { periods, loading, error };
  ```

  Sửa thành:
  ```typescript
  return { periods, loading, error, dailyAmounts };
  ```

- [ ] **Step 2: Dùng cached `dailyAmounts` trong `PaymentTabFast`**

  Mở `src/components/Installments/tabs/PaymentTabFast.tsx`. Tìm destructuring của hook (dòng 31-40):
  ```typescript
  const {
    periods: generatedPeriods,
    loading,
    error,
  } = useInstallmentPaymentPeriods(
    installment?.id,
    installment?.start_date,
    installment?.payment_period,
    refreshKey,
  );
  ```

  Sửa thành (thêm `dailyAmounts`):
  ```typescript
  const {
    periods: generatedPeriods,
    loading,
    error,
    dailyAmounts: cachedDailyAmounts,
  } = useInstallmentPaymentPeriods(
    installment?.id,
    installment?.start_date,
    installment?.payment_period,
    refreshKey,
  );
  ```

  Tìm trong `handleCheckboxChange` (khoảng dòng 160):
  ```typescript
  const dailyAmounts = await getExpectedMoney(installment.id);
  ```

  Sửa thành (dùng cached, fallback fetch nếu cache trống):
  ```typescript
  // Dùng cached dailyAmounts từ hook — tránh DB round-trip thêm
  const dailyAmounts = cachedDailyAmounts.length > 0
    ? cachedDailyAmounts
    : await getExpectedMoney(installment.id);
  ```

  Import `getExpectedMoney` ở đầu file vẫn giữ nguyên (cần cho fallback case khi cache chưa sẵn sàng).

- [ ] **Step 3: Kiểm tra TypeScript compile**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Kỳ vọng: no errors.

- [ ] **Step 4: Kiểm tra hành vi check/uncheck kỳ lãi**

  Dev server → mở 1 hợp đồng trả góp → mở modal chi tiết → tab thanh toán → check/uncheck 1 kỳ → kiểm tra:
  - Optimistic update vẫn hoạt động (UI update ngay)
  - Số liệu sau khi sync giống hệt trước
  - Network tab: trong quá trình check, KHÔNG thấy thêm request `get_expected_money` — chỉ thấy `upsert` vào `installment_history` và `update` `payment_due_date`

- [ ] **Step 5: Commit**

  ```bash
  git add src/hooks/useInstallmentPaymentPeriods.ts src/components/Installments/tabs/PaymentTabFast.tsx
  git commit -m "perf: cache dailyAmounts in hook to avoid redundant DB call on period check"
  ```

---

## Task 7: DB Indexes trên Supabase (chạy trực tiếp SQL Editor)

**Không có file code nào thay đổi.** Chạy SQL trực tiếp trên Supabase SQL Editor.

**Rủi ro data:** Không có. Indexes chỉ ảnh hưởng tốc độ query. `CONCURRENTLY` đảm bảo không lock table trong lúc tạo.

- [ ] **Step 1: Mở Supabase SQL Editor**

  Vào Supabase project dashboard → SQL Editor → New query.

- [ ] **Step 2: Chạy index 1 — `installment_history` composite index**

  Copy paste và chạy (từng query riêng biệt, không chạy tất cả cùng lúc):

  ```sql
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_installment_history_core
    ON installment_history (installment_id, is_deleted, transaction_type, effective_date);
  ```

  Kỳ vọng output: `CREATE INDEX`. Chờ cho đến khi query hoàn thành (có thể mất 30-60 giây với large table). `CONCURRENTLY` — không lock table, production vẫn dùng được trong lúc này.

- [ ] **Step 3: Verify index 1 đã tạo thành công**

  ```sql
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'installment_history'
    AND indexname = 'idx_installment_history_core';
  ```

  Kỳ vọng: trả về 1 row với indexname = `idx_installment_history_core`.

- [ ] **Step 4: Chạy index 2 — `installments` list filter index**

  ```sql
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_installments_list
    ON installments (store_id, status_code, payment_due_date);
  ```

  Kỳ vọng: `CREATE INDEX`. Chờ hoàn thành.

- [ ] **Step 5: Verify index 2**

  ```sql
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'installments'
    AND indexname = 'idx_installments_list';
  ```

  Kỳ vọng: trả về 1 row.

- [ ] **Step 6: Enable pg_trgm extension (cho tìm kiếm tiếng Việt)**

  ```sql
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  ```

  Kỳ vọng: `CREATE EXTENSION` hoặc `already exists` (nếu đã có).

- [ ] **Step 7: Chạy index 3 — trigram index cho tên khách hàng**

  ```sql
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_name_trgm
    ON customers USING gin (name gin_trgm_ops);
  ```

  Kỳ vọng: `CREATE INDEX`. Đây là GIN index — build chậm hơn BTree nhưng rất hiệu quả cho ILIKE `%value%`.

- [ ] **Step 8: Verify index 3**

  ```sql
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'customers'
    AND indexname = 'idx_customers_name_trgm';
  ```

  Kỳ vọng: trả về 1 row với `USING gin`.

- [ ] **Step 9: Kiểm tra hiệu quả của indexes**

  Chạy EXPLAIN ANALYZE trên query tìm kiếm installments để xác nhận indexes được dùng:

  ```sql
  EXPLAIN ANALYZE
  SELECT i.id, i.contract_code
  FROM installments_by_store i
  JOIN customers c ON i.customer_id = c.id
  WHERE i.store_id = (SELECT id FROM stores LIMIT 1)
    AND c.name ILIKE '%nguyen%'
  LIMIT 30;
  ```

  Kỳ vọng: Output EXPLAIN ANALYZE chứa `Index Scan using idx_customers_name_trgm` hoặc `Bitmap Index Scan` thay vì `Seq Scan` trên bảng customers. Execution time < 100ms.

- [ ] **Step 10: Test trên trang web**

  Mở `http://localhost:3000/installments` → tìm kiếm theo tên khách hàng → thời gian tải kết quả giảm rõ rệt.

  Load lần đầu trang installments → spinner biến mất nhanh hơn.

---

## Tóm tắt kỳ vọng sau tất cả tasks

| Vấn đề | Trước | Sau |
|--------|-------|-----|
| Load trang installments lần đầu | ~3-5s | ~0.5-1s |
| Check/uncheck kỳ lãi (DB call) | 5+ round-trips | 4 round-trips (bỏ 1 getExpectedMoney) |
| Đóng lãi nhanh (warnings) | ~2-3s chờ reload | Tức thì (optimistic) |
| Load trang warnings | ~2-3s (1000 records) | ~500ms (200 records) |
| Warnings stats | ~1.5s (3 sequential) | ~600ms (parallel) |
| Summary installments | ~2s (5 sequential) | ~800ms (2 + 3 parallel) |
| Tìm kiếm tên khách hàng | ~500ms (seq scan) | ~50ms (trigram index) |
