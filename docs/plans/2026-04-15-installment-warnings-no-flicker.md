# Installment Warnings No-Flicker Table Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate table flicker and scroll-position reset during background sync after payment on `/installment-warnings`.

**Architecture:** Three purely visual changes in `InstallmentWarningsTable.tsx` — remove the premature `setWarnings([])` clear, guard the full spinner to only show on initial load (no data), and wrap the table in a fade overlay that dims during reprocessing. Zero changes to calculation logic.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS

---

## Task 1: Three changes in `InstallmentWarningsTable.tsx`

**Files:**
- Modify: `src/components/Installments/InstallmentWarningsTable.tsx`

---

### Change 1 — Remove premature `setWarnings([])`

**Step 1: Find the line**

In `processWarnings` around line 157:
```typescript
setLoadingPayments(true);
setWarnings([]); // Clear old warnings before processing new ones  ← THIS LINE
```

**Step 2: Remove only that one line**

After edit, the block should look like:
```typescript
setLoadingPayments(true);

try {
```

**IMPORTANT:** Do NOT remove the `setWarnings([])` at line 152 which is inside the early-return guard:
```typescript
if (!installments.length) {
  setWarnings([]); // Clear warnings when no installments  ← KEEP THIS
  return;
}
```
Only remove the one at line 157 (after `setLoadingPayments(true)`).

---

### Change 2 — Guard full spinner to initial load only

**Step 3: Find the spinner condition**

Around line 320:
```typescript
if (isLoading || loadingPayments) {
  return (
    <div className="h-96 flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
```

**Step 4: Add `&& warnings.length === 0` guard**

```typescript
if ((isLoading || loadingPayments) && warnings.length === 0) {
  return (
    <div className="h-96 flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
```

---

### Change 3 — Add fade overlay wrapper

**Step 5: Find the return statement**

Around line 338:
```tsx
return (
  <div className="rounded-md border overflow-hidden">
    <div className="overflow-x-auto max-w-full">
      <table ...>
      ...
      </table>
    </div>
  </div>
);
```

**Step 6: Wrap with fade div**

```tsx
return (
  <div className={`transition-opacity duration-300 ${loadingPayments ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
    <div className="rounded-md border overflow-hidden">
      <div className="overflow-x-auto max-w-full">
        <table ...>
        ...
        </table>
      </div>
    </div>
  </div>
);
```

The outer `<div className="rounded-md border overflow-hidden">` becomes the second div. Only add the new wrapper div — do not change anything inside the existing divs or table.

---

### Step 7: Verify visually

1. Open `http://localhost:3000/installment-warnings`
2. Scroll down to row ~25-30
3. Click a quick-pay button
4. **Expected:** Toast appears, table dims slightly (~60% opacity) for ~1s, fades back to full — scroll position stays exactly where it was
5. If installment was fully paid: row disappears immediately (from optimistic update), table still doesn't scroll to top

---

### Step 8: Commit

```bash
cd credit_v2
git add src/components/Installments/InstallmentWarningsTable.tsx
git commit -m "feat: no-flicker table during background sync on installment-warnings

- Keep existing rows visible during reprocessing (remove premature setWarnings([]))
- Full spinner only on initial load when no data exists yet
- Fade overlay (opacity-60) during background sync, smooth transition back"
```
