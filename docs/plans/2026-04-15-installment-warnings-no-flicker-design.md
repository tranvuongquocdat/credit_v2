# Design: No-Flicker Table During Background Sync

**Date:** 2026-04-15
**File:** `src/components/Installments/InstallmentWarningsTable.tsx`

## Problem

When `loadInstallments({ silent: true })` completes after a payment, it updates `installments` prop → table's `processWarnings` useEffect fires → `setWarnings([])` clears rows → `loadingPayments = true` shows full spinner → DOM replaced → scroll position lost. Duration: ~1s.

## Root Cause

Two lines in `processWarnings`:
1. `setWarnings([])` — clears existing rows before RPC calls complete
2. `if (isLoading || loadingPayments) return <Spinner>` — replaces entire table with spinner unconditionally

## Solution

Three minimal changes, all in `InstallmentWarningsTable.tsx`, zero logic changes:

### 1. Remove `setWarnings([])`
Keep existing rows visible during reprocessing. They'll be replaced naturally when `setWarnings(paginatedResults)` is called at the end.

### 2. Change spinner condition
```tsx
// Before
if (isLoading || loadingPayments) return <Spinner>

// After
if ((isLoading || loadingPayments) && warnings.length === 0) return <Spinner>
```
Full spinner only on initial load (no data yet). Never replaces an existing table.

### 3. Fade overlay during reprocessing
Wrap the existing `<div className="rounded-md border overflow-hidden">` in a parent div with opacity transition:
```tsx
<div className={`transition-opacity duration-300 ${loadingPayments ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
  <div className="rounded-md border overflow-hidden">
    ...
  </div>
</div>
```

## Result
- Initial page load: full spinner as before ✅
- After payment (background sync): table stays visible, fades to 60% opacity for ~1s, fades back to 100% ✅
- Scroll position: never lost ✅
- Logic/calculations: completely unchanged ✅
