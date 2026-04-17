# Design: Smooth Payment UX for Installment Warnings Page

**Date:** 2026-04-15
**Page:** `/installment-warnings`
**Problem:** Clicking "đóng tiền nhanh" causes full page reload (loading spinner covers entire table), creating jarring UX.

## Root Cause

After successful payment, `processPayment` calls `loadInstallments()` which:
1. Sets `isLoading = true` → entire table replaced with full-page spinner
2. Re-fetches all installments from server
3. Table receives new `installments` prop → `loadingPayments = true` → another spinner

Two consecutive spinners = feels like full page reload.

Additionally, `processingPayment` boolean is not passed down to the table, so buttons are never visually disabled during processing — double-click risk.

## Solution: Optimistic Update + Silent Background Sync

### 1. Race Condition Protection

Add `disablePayments: boolean` prop to `InstallmentWarningsTable`. When `true`, all quick-pay buttons are `disabled`. The page sets this to `processingPayment` state (already exists).

This prevents double-clicks and concurrent payment requests.

### 2. Optimistic Update After Successful Insert

After the DB insert succeeds (and before any reload), immediately update `filteredInstallments` client-side:

- Calculate `numberOfPeriods` paid (already computed in `processPayment`)
- For the paid installment, compute new `latePeriods = old - numberOfPeriods`
- If `latePeriods <= 0` → remove installment from `filteredInstallments`
- If `latePeriods > 0` → keep installment but update it so table reprocesses with new data

The calculation reuses logic already present in `processPayment` — no new logic needed.

### 3. Silent Background Refresh

Add `silent?: boolean` param to `loadInstallments()`:
- When `silent = true`: skip `setIsLoading(true)` — table stays visible
- Fetch fresh data from server → update `filteredInstallments` quietly
- Called after optimistic update to sync accurate server state

## Files Changed

| File | Change |
|------|--------|
| `src/app/installment-warnings/page.tsx` | Add `silent` param to `loadInstallments`, add optimistic update in `processPayment` after DB insert, pass `processingPayment` as `disablePayments` to table |
| `src/components/Installments/InstallmentWarningsTable.tsx` | Add `disablePayments?: boolean` prop, apply `disabled={disablePayments}` to all quick-pay buttons |

## What Does NOT Change

- `processPayment` logic (DB insert, date calculations, RPC calls) — untouched
- `getInstallmentWarnings` fetch logic — untouched
- Table's warning processing logic (`processWarnings` useEffect) — untouched
- All other page functionality (search, filter, export, pagination) — untouched

## UX After Fix

1. User clicks pay button → button disabled immediately (processingPayment = true)
2. Payment processes in background
3. Success toast appears
4. Row disappears (if fully paid) or stays with updated state — **instantly, no spinner**
5. Server data silently re-fetched in background to ensure accuracy
