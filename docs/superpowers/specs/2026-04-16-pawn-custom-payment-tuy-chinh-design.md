# Design: Tiền tùy chỉnh trong form đóng lãi phí tùy biến (Cầm đồ)

**Ngày:** 2026-04-16  
**File liên quan:** `credit/src/components/Pawns/PawnPaymentForm.tsx`  
**Scope:** Chỉ Cầm đồ (Pawns), không ảnh hưởng Credits hay Installments

---

## Tóm tắt

Thay đổi UI trong form "Đóng lãi phí tùy biến theo ngày" của hợp đồng cầm đồ:

1. Khóa trường **Tiền lãi phí** thành read-only (luôn tự tính, không cho sửa)
2. Thêm trường **Tiền tùy chỉnh** — input mới hỗ trợ số âm (vd: -10.000)
3. **Tổng tiền lãi phí** = Tiền lãi phí + Tiền tùy chỉnh (công thức giữ nguyên)

---

## UI Changes

### Grid rows sau thay đổi (theo thứ tự)

| Row | Field | Loại | Ghi chú |
|-----|-------|------|---------|
| Từ ngày | startDate | read-only | Không đổi |
| Số ngày | days | editable | Không đổi |
| Đến ngày | endDate | computed | Không đổi |
| **Tiền lãi phí** | interestAmount | **read-only** | Bỏ onChange, disabled cứng, hint: "Tự động tính, không thể thay đổi" |
| **Tiền tùy chỉnh** | otherAmount | **editable** | Mới thêm, hỗ trợ số âm, hint: "VNĐ (có thể âm)" |
| Tổng tiền lãi phí | totalAmount | computed | Giữ nguyên = interestAmount + otherAmount |

---

## Chi tiết kỹ thuật

### 1. Khóa Tiền lãi phí

- Xóa `onChange={handleInterestAmountChange}` khỏi Input
- Đổi `disabled={disabled}` → `disabled={true}` (luôn disabled)
- Đổi hint text: "Tự động tính, không thể thay đổi"
- Giữ nguyên spinner khi `isCalculating`

### 2. Thêm row Tiền tùy chỉnh

- Thêm row mới vào grid giữa "Tiền lãi phí" và "Tổng tiền lãi phí"
- Label: "Tiền tùy chỉnh :"
- Input: `value={formattedOtherAmount}`, `onChange={handleOtherAmountChange}`
- `disabled={disabled}` (theo prop, không cứng)
- Hint: "VNĐ (có thể âm)"

### 3. Xử lý số âm cho otherAmount

`handleOtherAmountChange` cần được sửa để:

```
- Cho phép dấu "-" ở đầu
- Strip mọi ký tự không phải số, ngoại trừ "-" đứng đầu
- Format phần số tuyệt đối với dấu chấm ngăn cách hàng nghìn
- Kết quả hiển thị: "-50.000" (nếu âm) hoặc "50.000" (nếu dương)
- rawValue (lưu vào state) là string số nguyên: "-50000" hoặc "50000"
```

Logic parse:
```
input "-50.000" → rawValue = "-50000" → otherAmount state = "-50000"
Number("-50000") = -50000 ✓
```

`formatNumber` hiện tại strip dấu `-`, cần tách logic: format riêng cho negative values thay vì dùng chung `formatNumber`.

### 4. Tổng tiền lãi phí

Công thức cập nhật để tránh NaN khi user đang gõ dở dấu `-`:
```typescript
const totalAmount = Number(interestAmount) + (Number(otherAmount) || 0);
```

Hiển thị: đỏ đậm như hiện tại. Nếu `totalAmount < 0` vẫn hiển thị bình thường (edge case không cần xử lý đặc biệt).

**Edge case "-" trung gian:** Khi user gõ chỉ dấu `-` chưa nhập số, `Number("-")` = NaN → dùng `|| 0` để tổng vẫn hiển thị đúng.

---

## Submit payload

Không thay đổi — vẫn gọi `onSuccess` với:

```typescript
{
  startDate,
  endDate,
  days: Number(days),
  interestAmount: Number(interestAmount),
  otherAmount: Number(otherAmount),   // có thể âm
  totalAmount                          // = interestAmount + otherAmount
}
```

`saveCustomPaymentWithAmount` và `recordDailyPaymentsWithCustomAmount` không cần sửa.

---

## Không thay đổi

- `credit/src/lib/Pawns/save_custom_payment.ts`
- `credit/src/lib/Pawns/record_daily_payments.ts`
- Credits components và libs
- Installments components và libs
- Database schema
