# Pawn Custom Payment - Tiền tùy chỉnh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khóa trường "Tiền lãi phí" thành read-only và thêm trường "Tiền tùy chỉnh" hỗ trợ số âm vào form đóng lãi phí tùy biến của hợp đồng cầm đồ.

**Architecture:** Thay đổi tập trung hoàn toàn vào một file component `PawnPaymentForm.tsx`. Trường `interestAmount` chuyển thành read-only. `otherAmount` (đã có trong state/submit) được thêm UI mới với handler hỗ trợ số âm. Backend và submit payload không đổi.

**Tech Stack:** Next.js 15, React, TypeScript, Tailwind CSS, shadcn/ui Input component

---

## File Map

| File | Action | Mô tả |
|------|--------|--------|
| `credit/src/components/Pawns/PawnPaymentForm.tsx` | Modify | Toàn bộ thay đổi nằm ở đây |

---

### Task 1: Khóa trường Tiền lãi phí

**Files:**
- Modify: `credit/src/components/Pawns/PawnPaymentForm.tsx`

- [ ] **Step 1: Xóa handler `handleInterestAmountChange` (không còn dùng)**

Xóa hoàn toàn hàm này khỏi file (dòng 129–133):

```typescript
// XÓA TOÀN BỘ ĐOẠN NÀY:
// Handle interest amount change
const handleInterestAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const rawValue = e.target.value.replace(/\./g, '');
  setInterestAmount(rawValue);
  setFormattedInterestAmount(formatNumber(rawValue));
};
```

- [ ] **Step 2: Cập nhật Input "Tiền lãi phí" thành read-only**

Tìm đoạn Input của Tiền lãi phí (khoảng dòng 238–245) và thay bằng:

```tsx
<div className="text-right pr-2">Tiền lãi phí :</div>
<div className="flex items-center gap-3">
  <div className="relative">
    <Input
      value={formattedInterestAmount}
      className="w-48 bg-gray-50 cursor-not-allowed"
      inputMode="numeric"
      type="text"
      disabled={true}
      readOnly
    />
    {isCalculating && (
      <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
        <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin"></div>
      </div>
    )}
  </div>
  <span className="text-gray-500 text-sm">VNĐ (Tự động tính, không thể thay đổi)</span>
</div>
```

- [ ] **Step 3: Kiểm tra thủ công**

Mở trình duyệt tại `http://localhost:3000`, vào một hợp đồng cầm đồ, tab "Đóng lãi phí", mở section "Đóng lãi phí tùy biến theo ngày". Xác nhận:
- Trường "Tiền lãi phí" hiển thị giá trị nhưng không click/sửa được
- Thay đổi số ngày vẫn cập nhật Tiền lãi phí tự động
- Spinner vẫn xuất hiện khi đang tính

- [ ] **Step 4: Commit**

```bash
git add credit/src/components/Pawns/PawnPaymentForm.tsx
git commit -m "feat: lock tiền lãi phí field as read-only in pawn custom payment form"
```

---

### Task 2: Sửa handler `handleOtherAmountChange` hỗ trợ số âm

**Files:**
- Modify: `credit/src/components/Pawns/PawnPaymentForm.tsx`

- [ ] **Step 1: Thay thế `handleOtherAmountChange`**

Tìm hàm `handleOtherAmountChange` hiện tại (khoảng dòng 136–139):

```typescript
// Handle other amount change
const handleOtherAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const rawValue = e.target.value.replace(/\./g, '');
  setOtherAmount(rawValue);
  setFormattedOtherAmount(formatNumber(rawValue));
};
```

Thay bằng:

```typescript
// Handle other amount change - hỗ trợ số âm
const handleOtherAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const input = e.target.value;
  const isNegative = input.startsWith('-');
  const digits = input.replace(/[^0-9]/g, '');
  // rawValue: "-50000", "50000", hoặc "-" (trạng thái trung gian)
  const rawValue = isNegative ? (digits ? `-${digits}` : '-') : digits;
  setOtherAmount(rawValue);
  // Format hiển thị với dấu chấm ngăn cách hàng nghìn
  const formattedDigits = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  setFormattedOtherAmount(isNegative ? (digits ? `-${formattedDigits}` : '-') : formattedDigits);
};
```

- [ ] **Step 2: Cập nhật `totalAmount` để tránh NaN khi otherAmount = "-"**

Tìm dòng:
```typescript
const totalAmount = Number(interestAmount) + Number(otherAmount);
```

Thay bằng:
```typescript
const totalAmount = Number(interestAmount) + (Number(otherAmount) || 0);
```

- [ ] **Step 3: Commit**

```bash
git add credit/src/components/Pawns/PawnPaymentForm.tsx
git commit -m "feat: support negative values in pawn custom payment other amount handler"
```

---

### Task 3: Thêm row "Tiền tùy chỉnh" vào form UI

**Files:**
- Modify: `credit/src/components/Pawns/PawnPaymentForm.tsx`

- [ ] **Step 1: Thêm row Tiền tùy chỉnh vào grid**

Tìm đoạn row "Tổng tiền lãi phí" (khoảng dòng 255–258):

```tsx
<div className="text-right pr-2">Tổng tiền lãi phí :</div>
<div className="text-red-600 font-bold">
  {new Intl.NumberFormat('vi-VN').format(totalAmount)} VNĐ
</div>
```

Thêm row "Tiền tùy chỉnh" **ngay trước** đoạn trên:

```tsx
<div className="text-right pr-2">Tiền tùy chỉnh :</div>
<div className="flex items-center gap-3">
  <Input
    value={formattedOtherAmount}
    onChange={handleOtherAmountChange}
    className="w-48"
    inputMode="numeric"
    type="text"
    disabled={disabled}
    placeholder="0"
  />
  <span className="text-gray-500 text-sm">VNĐ (có thể âm)</span>
</div>

<div className="text-right pr-2">Tổng tiền lãi phí :</div>
<div className="text-red-600 font-bold">
  {new Intl.NumberFormat('vi-VN').format(totalAmount)} VNĐ
</div>
```

- [ ] **Step 2: Kiểm tra thủ công**

Mở trình duyệt, vào form đóng lãi phí tùy biến. Xác nhận:

1. Row "Tiền tùy chỉnh" hiển thị giữa "Tiền lãi phí" và "Tổng tiền lãi phí"
2. Nhập `10000` → Tổng = Tiền lãi phí + 10.000
3. Nhập `-10000` → Tổng = Tiền lãi phí - 10.000
4. Nhập chỉ `-` → Tổng vẫn hiển thị đúng (không phải NaN)
5. Xóa sạch Tiền tùy chỉnh → Tổng = Tiền lãi phí
6. Bấm "Đóng lãi" → submit thành công

- [ ] **Step 3: Commit**

```bash
git add credit/src/components/Pawns/PawnPaymentForm.tsx
git commit -m "feat: add tiền tùy chỉnh field to pawn custom payment form"
```

---

## Checklist cuối

- [ ] Tiền lãi phí: không sửa được, vẫn tự tính khi đổi số ngày
- [ ] Tiền tùy chỉnh: nhập được số dương và âm
- [ ] Tổng tiền lãi phí = Tiền lãi phí + Tiền tùy chỉnh, không hiển thị NaN
- [ ] Submit payload vẫn đúng (kiểm tra network tab hoặc toast thành công)
- [ ] Credits, Installments không bị ảnh hưởng
