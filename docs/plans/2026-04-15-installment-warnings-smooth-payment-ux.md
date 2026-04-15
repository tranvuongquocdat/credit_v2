# Installment Warnings Smooth Payment UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate full-page reload/spinner after clicking "đóng tiền nhanh" on `/installment-warnings` — replace with optimistic UI update + silent background sync.

**Architecture:** After payment DB insert succeeds, immediately update `filteredInstallments` state client-side (remove row if fully paid, keep otherwise). Then re-fetch from server silently (no `isLoading = true`). Add `disablePayments` prop to table to block concurrent clicks.

**Tech Stack:** Next.js 14, React, TypeScript, Supabase

---

## Task 1: Add `disablePayments` prop to `InstallmentWarningsTable`

**Files:**
- Modify: `src/components/Installments/InstallmentWarningsTable.tsx`

**Step 1: Add the prop to the interface**

In `InstallmentWarningsTable.tsx`, find the `InstallmentWarningsTableProps` interface (around line 23) and add `disablePayments`:

```typescript
interface InstallmentWarningsTableProps {
  installments: InstallmentWithCustomer[];
  isLoading: boolean;
  reasonFilter?: ReasonFilter;
  currentPage?: number;
  itemsPerPage?: number;
  onFilteredResults?: (results: InstallmentWarning[]) => void;
  onPayment?: (installment: InstallmentWithCustomer, amount: number) => void;
  onCustomerClick?: (installment: InstallmentWithCustomer) => void;
  onShowPaymentHistory?: (installment: InstallmentWithCustomer) => void;
  disablePayments?: boolean; // NEW: disable all pay buttons during processing
}
```

**Step 2: Destructure the new prop in the function signature**

Find the function signature `export function InstallmentWarningsTable({` (around line 98) and add `disablePayments = false`:

```typescript
export function InstallmentWarningsTable({
  installments,
  isLoading,
  reasonFilter = "all",
  currentPage = 1,
  itemsPerPage = 30,
  onFilteredResults,
  onPayment,
  onCustomerClick,
  onShowPaymentHistory,
  disablePayments = false, // NEW
}: InstallmentWarningsTableProps) {
```

**Step 3: Apply `disabled` to every quick-pay button**

Find the `quickPayButtons.push(` block (around line 409). The `<Button>` currently has no `disabled` prop. Add it:

```tsx
quickPayButtons.push(
  <Button
    key={i}
    variant="outline"
    size="sm"
    className="mx-0.5 sm:mx-1 px-1 sm:px-3 py-1 bg-green-100 hover:bg-green-200 text-green-800 border-green-300 text-xs sm:text-sm"
    onClick={() => onPayment && onPayment(warning, warning.buttonValues[i])}
    disabled={disablePayments} // NEW
  >
    {buttonAmount}
  </Button>
);
```

**Step 4: Manual verify**

Open browser at `http://localhost:3000/installment-warnings`. Open DevTools → React DevTools or just confirm the prop is wired (will be tested for real in Task 3).

---

## Task 2: Add `silent` option to `loadInstallments` in page

**Files:**
- Modify: `src/app/installment-warnings/page.tsx`

**Step 1: Update `loadInstallments` signature to accept `silent` option**

Find `async function loadInstallments()` (around line 86). Change to:

```typescript
async function loadInstallments(options?: { silent?: boolean }) {
  if (!currentStore?.id) return;

  const currentRequestId = ++requestIdRef.current;

  if (!options?.silent) {
    setIsLoading(true); // Only show spinner on non-silent fetches
  }
  // ... rest of function stays exactly the same ...
}
```

Only the first line inside the function body changes — `setIsLoading(true)` becomes guarded by `if (!options?.silent)`. Everything else (fetch, error handling, `setInstallments`, `finally`) stays identical.

**Step 2: Pass `disablePayments` prop to `InstallmentWarningsTable`**

Find the `<InstallmentWarningsTable` JSX (around line 619). Add the new prop:

```tsx
<InstallmentWarningsTable
    installments={filteredInstallments}
    isLoading={isLoading}
    reasonFilter={reasonFilter}
    currentPage={currentPage}
    itemsPerPage={itemsPerPage}
    onFilteredResults={handleFilteredResults}
    onPayment={handlePayment}
    onCustomerClick={handleCustomerClick}
    onShowPaymentHistory={handleShowPaymentHistory}
    disablePayments={processingPayment} // NEW
/>
```

**Step 3: Manual verify**

Navigate to the page. Open DevTools Console. Confirm no TypeScript errors in the terminal running `next dev`.

---

## Task 3: Add optimistic update in `processPayment`

**Files:**
- Modify: `src/app/installment-warnings/page.tsx`

**Context:** The existing `processPayment` function (around line 293) already computes `numberOfPeriods`. After the DB insert succeeds (around line 442-449), we need to:
1. Optimistically remove/update the installment in `filteredInstallments`
2. Call `loadInstallments({ silent: true })` instead of `loadInstallments()`

**Step 1: Replace `loadInstallments()` call with optimistic update + silent reload**

Find this block near the end of `processPayment` (around line 470-476):

```typescript
      // Success
      toast({
        title: "Thanh toán thành công",
        description: `Đã thanh toán ${amount.toLocaleString()} VND cho hợp đồng ${installment.contract_code} (${numberOfPeriods} kỳ, ${allDailyRecords.length} ngày)`,
      });

      // Reload installments to update the UI
      loadInstallments();
```

Replace with:

```typescript
      // Success
      toast({
        title: "Thanh toán thành công",
        description: `Đã thanh toán ${amount.toLocaleString()} VND cho hợp đồng ${installment.contract_code} (${numberOfPeriods} kỳ, ${allDailyRecords.length} ngày)`,
      });

      // Optimistic update: remove/keep installment based on remaining periods
      const remainingPeriods = unpaidPeriods.length - numberOfPeriods;
      if (remainingPeriods <= 0) {
        // Fully paid — remove from list immediately
        setFilteredInstallments(prev =>
          prev.filter(i => i.id !== installment.id)
        );
        setInstallments(prev =>
          prev.filter(i => i.id !== installment.id)
        );
      }
      // If remainingPeriods > 0: keep the row — table will reprocess on silent reload

      // Silent background sync (no spinner)
      loadInstallments({ silent: true });
```

**Why this works:**
- `unpaidPeriods` is already computed earlier in `processPayment` (the array of overdue periods)
- `numberOfPeriods` is already computed (how many periods this payment covers)
- If `remainingPeriods <= 0`, we filter the installment out of both state arrays immediately
- The table's `processWarnings` useEffect only fires when `installments` prop changes — on silent reload it will reprocess with fresh server data, no visible spinner because `isLoading` stays false

**Step 2: Manual verify — full happy path**

1. Open `http://localhost:3000/installment-warnings`
2. Find an installment with multiple overdue periods
3. Click the smallest pay button (1 kỳ)
4. **Expected:** Toast appears, NO full-page spinner, row either stays (if more periods remain) or disappears (if fully paid)
5. Wait 2-3 seconds — data silently refreshes from server in background
6. Confirm data is accurate

**Step 3: Manual verify — double-click protection**

1. Click a pay button quickly twice
2. **Expected:** Second click does nothing (button disabled while `processingPayment = true`)
3. Only one toast appears, no duplicate DB records

**Step 4: Commit**

```bash
cd credit_v2
git add src/app/installment-warnings/page.tsx src/components/Installments/InstallmentWarningsTable.tsx
git commit -m "feat: smooth payment UX on installment-warnings page

- Optimistic UI update removes/keeps row immediately after payment
- Silent background refresh syncs server data without showing spinner
- disablePayments prop blocks concurrent clicks during processing"
```

---

## Edge Cases to Verify

| Scenario | Expected behavior |
|----------|------------------|
| Pay last period of contract | Row disappears immediately |
| Pay 1 of 3 overdue periods | Row stays, silent refresh updates button values |
| Network error during payment | Error toast, no optimistic update (already handled by existing try/catch) |
| Double-click pay button | Second click ignored (button disabled) |
| Pay while on page 2 of pagination | Correct row removed, pagination recalculates |
