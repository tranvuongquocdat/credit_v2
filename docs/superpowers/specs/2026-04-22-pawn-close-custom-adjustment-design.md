# Pawn — Tiền tùy chỉnh khi đóng hợp đồng (chuộc đồ / thanh lý)

**Ngày**: 2026-04-22
**Phạm vi**: Cầm đồ (Pawns) — luồng đóng hợp đồng tại `RedeemTab` và reopen tại `Pawns/reopen_contract.ts`.

## 1. Mục tiêu

Cho phép nhân viên nhập một khoản **Tiền tùy chỉnh** (có thể âm hoặc dương) kèm ghi chú tự do khi đóng hợp đồng cầm đồ. Khoản tiền này:

- Dương ⇒ nạp vào quỹ; âm ⇒ rút khỏi quỹ.
- Ngữ nghĩa cụ thể do nhân viên ghi trong note (không ràng buộc nghiệp vụ, tương đương "dòng điều chỉnh quỹ tự do gắn với hành động đóng HĐ").
- Phải chảy vào **mọi** aggregate hiện có của web: tổng kết giao dịch, tổng tiền, quỹ, báo cáo cashbook, contractClose, interestDetail, money-by-day, dashboard, snapshot quỹ ngày.
- Khi mở lại HĐ (reopen) phải được revert cùng với các row khác để quỹ trở về trạng thái trước khi đóng.

## 2. Phi mục tiêu

- Không áp dụng cho Credits (Tín dụng) và Installments (Trả góp) ở lần thay đổi này.
- Không tạo permission mới — dùng quyền chuộc đồ hiện có.
- Không giới hạn giá trị tuyệt đối của Tiền tùy chỉnh.

## 3. Hiện trạng

### 3.1 Luồng đóng HĐ hiện tại — `RedeemTab.tsx::handleRedeemPawn`

Ghi vào `pawn_history` các row sau, tất cả đều có `is_created_from_contract_closure=true`:

1. `contract_close` — `credit_amount = gốc` (hoàn trả gốc về quỹ).
2. `debt_payment` — nếu có nợ cũ và nhân viên chọn "trả nợ".
3. `payment` × N — từ `recordDailyPayments` khi còn lãi phí chưa đóng.

Sau đó cập nhật `pawn.status = CLOSED`.

### 3.2 Luồng reopen — `Pawns/reopen_contract.ts`

1. Fetch `contract_close` row gần nhất để biết số gốc đã refund.
2. Fetch và mark `is_deleted=true` tất cả row `payment` có `is_created_from_contract_closure=true`.
3. Insert row `contract_reopen` với `debit_amount = contractCloseAmount` (triệt tiêu hiệu ứng của `contract_close`).
4. Update các row `payment` vừa mark deleted: set `is_created_from_contract_closure=false` (tránh lần đóng/reopen sau quét lại).
5. Update `pawn.status = ON_TIME`.

### 3.3 Luồng aggregate tiền — điểm tích hợp cần chú ý

Tất cả đọc từ `pawn_history`, công thức phổ biến `credit_amount - debit_amount`, filter `is_deleted=false`:

- `src/hooks/useTransactionSummary.ts` — tổng kết giao dịch + map dịch label transaction_type.
- `src/hooks/useCashbook.ts` + `src/app/reports/cashbook/components/PawnTable.tsx` — sổ quỹ.
- `src/app/reports/contractClose/page.tsx` + `ExcelExport.tsx` — báo cáo đóng HĐ.
- `src/app/reports/interestDetail/page.tsx` + `ExcelExport.tsx` — chi tiết lãi.
- `src/app/reports/money-by-day/page.tsx`, `src/app/reports/transactionSummary/components/ExcelExport.tsx`.
- `src/app/total-fund/page.tsx`, `src/app/dashboard/page.tsx`.
- `daily_fund_snapshot.sql` (root level).
- `src/components/Pawns/PawnHistoryModal.tsx` — hiển thị lịch sử row-by-row.

## 4. Thiết kế

### 4.1 Transaction type mới

Thêm hằng mới: **`contract_close_adjustment`**.
Label dịch: **"Điều chỉnh khi đóng HĐ"**.

Khớp pattern sẵn có `contract_<hành_động>_<bổ_ngữ>` (`contract_close`, `contract_reopen`, `contract_rotate`).

### 4.2 UI — `src/components/Pawns/tabs/RedeemTab.tsx`

Ngay **dưới** bảng tổng kết hiện có và **trên** cụm nút hành động, bổ sung một khối input:

```
┌──────────────────────────────────────────┐
│ Tiền tùy chỉnh    [ money-input +/- ]    │
│ Ghi chú           [ textarea, optional ] │
└──────────────────────────────────────────┘
```

- `money-input` cho phép giá trị âm (dùng component money-input hiện có; nếu không hỗ trợ âm cần mở rộng hoặc dùng input số thường).
- `Ghi chú` là `textarea`, không bắt buộc.

Bảng tổng kết thêm dòng ngay trước dòng "Tổng cần thanh toán":

| Tiền tùy chỉnh (note nếu có) | `+/- formatCurrency(customAmount)` |

"Tổng cần thanh toán" đổi công thức thành:

```
total = actualLoanAmount + oldDebt + remainingAmount + customAmount
```

Trong dialog xác nhận, thêm 1 dòng tóm tắt `Tiền tùy chỉnh: +/-X VNĐ — [note]` (chỉ hiển thị khi `customAmount !== 0`).

Áp dụng cho **cả hai** nút: "Chuộc đồ" (`shouldPayDebt=true`) và "Thanh lý không trả nợ" (`shouldPayDebt=false`).

### 4.3 Validation

- `customAmount !== 0` ⇒ ghi row (note có thể rỗng).
- `customAmount === 0` ⇒ skip hoàn toàn, không insert row.
- Không giới hạn biên độ tuyệt đối.
- Không bắt buộc note.

### 4.4 DB write — trong `handleRedeemPawn`

Sau khi ghi xong các row hiện có (`contract_close`, `debt_payment`, `payment` từ `recordDailyPayments`), trước khi `updatePawnStatus(CLOSED)`:

```ts
if (customAmount !== 0) {
  await supabase.from('pawn_history').insert({
    pawn_id: pawnId,
    transaction_type: 'contract_close_adjustment',
    credit_amount: customAmount > 0 ? customAmount : 0,
    debit_amount: customAmount < 0 ? Math.abs(customAmount) : 0,
    description: customNote,          // note thô, có thể rỗng
    is_created_from_contract_closure: true,
    created_by: userId,
  } as any);
}
```

Lưu ý: `description` không prefix "Tiền tùy chỉnh: …" vì `transaction_type` đã được map sang "Điều chỉnh khi đóng HĐ" ở mọi UI.

### 4.5 Reopen — `src/lib/Pawns/reopen_contract.ts`

Thêm 1 bước UPDATE duy nhất (có thể đặt song song với bước mark `payment` rows):

```ts
await supabase.from('pawn_history')
  .update({
    is_deleted: true,
    is_created_from_contract_closure: false,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  })
  .eq('pawn_id', pawnId)
  .eq('transaction_type', 'contract_close_adjustment')
  .eq('is_created_from_contract_closure', true);
```

**Không** cộng customAmount vào row `contract_reopen`. Lý do:

- `contract_reopen` hiện tại chỉ đảo gốc (không đảo payment). Payment được đảo gián tiếp qua `is_deleted=true`. Adjustment đi theo đúng cơ chế đó để giữ signature reopen sạch sẽ.
- Mark `is_deleted=true` + filter view là đủ để quỹ về trạng thái trước close.

### 4.6 Map label dịch transaction_type

Thêm entry `contract_close_adjustment: 'Điều chỉnh khi đóng HĐ'` vào **tất cả** các map dịch đang liệt kê transaction types. Vị trí đã biết:

- `src/hooks/useTransactionSummary.ts` (quanh dòng 394).

Khi implement: grep toàn bộ repo theo `contract_close` và `transaction_type` để tìm các map/switch còn lại, thêm entry tương ứng.

### 4.7 Audit các aggregate

Nguyên tắc: hầu hết aggregate dùng công thức `credit_amount - debit_amount` nên **tự động** bao gồm adjustment. Tuy nhiên cần xác minh từng nơi:

| File | Cần làm |
|---|---|
| `useTransactionSummary.ts` | Thêm label dịch. Không cần filter thêm. |
| `useCashbook.ts` / `reports/cashbook/components/PawnTable.tsx` | Kiểm tra có whitelist transaction_type không; nếu có, thêm `contract_close_adjustment`. |
| `reports/contractClose/page.tsx` + `ExcelExport.tsx` | Quyết định: **có** include adjustment vào export (vì thuộc hành động đóng HĐ). Thêm cột hoặc gộp vào cột phù hợp. |
| `reports/interestDetail/page.tsx` + `ExcelExport.tsx` | **Loại** adjustment khỏi tính toán tổng lãi (adjustment không phải lãi). Nếu query không filter type thì thêm filter bỏ qua `contract_close_adjustment`. |
| `reports/money-by-day/page.tsx` | Kiểm tra filter; tự động OK nếu dùng `credit_amount - debit_amount` toàn bảng. |
| `reports/transactionSummary/components/ExcelExport.tsx` + `TransactionDetailsTable.tsx` | Thêm label dịch; verify không whitelist. |
| `total-fund/page.tsx`, `dashboard/page.tsx` | Kiểm tra; thường đọc từ view/hook đã gồm. |
| `daily_fund_snapshot.sql` | Kiểm tra query; nếu filter by type cần thêm `contract_close_adjustment`. |
| `components/Pawns/PawnHistoryModal.tsx` | Render row adjustment: dùng label dịch, hiển thị `credit_amount - debit_amount` kèm `description` (note). |
| `hooks/usePawnCalculations` (qua `FinancialSummary`) | Verify tổng hợp quỹ cho trang chi tiết pawn đã cộng adjustment. |

**Bắt buộc** audit mọi nơi đọc `pawn_history` để chắc chắn đều filter `is_deleted=false`. Nếu thiếu, sau khi reopen adjustment vẫn bị tính → sai quỹ.

### 4.8 Types & schema

- `pawn_history` đã có đủ cột (`transaction_type`, `credit_amount`, `debit_amount`, `description`, `is_created_from_contract_closure`, `is_deleted`, `updated_by`, `updated_at`). Không cần migration.
- Nếu `transaction_type` có CHECK constraint / enum trong schema SQL, cần bổ sung giá trị `contract_close_adjustment`. Kiểm tra `schema.sql` và các migration notes khi implement.
- Cập nhật `src/types/database.types.ts` bằng `npm run update-types` nếu cần.

## 5. Edge cases

- **customAmount = 0 + note có giá trị**: coi như không nhập gì, skip insert. (Không lưu note trống rỗng vào DB.)
- **Reopen rồi close lại**: lần close lại insert row adjustment mới với `is_created_from_contract_closure=true` (row cũ đã bị mark `=false` ở lần reopen trước, không bị đụng). Reopen lần 2 sẽ chỉ tác động row mới nhất. Idempotent.
- **Hợp đồng đã CLOSED/DELETED**: input bị disable (giữ đúng hành vi hiện có của tab).
- **Nhân viên nhập customAmount âm lớn hơn total còn lại**: vẫn cho phép (theo nguyên tắc "không giới hạn"). Nhân viên chịu trách nhiệm kiểm tra tay.

## 6. Rủi ro & mitigation

| Rủi ro | Mitigation |
|---|---|
| Quên audit một nơi đọc `pawn_history` không filter `is_deleted=false` → adjustment còn sót sau reopen. | Grep toàn repo theo `from('pawn_history')` và `pawn_history` trong SQL, review từng nơi. Test case: close có adjustment → reopen → verify tổng quỹ trở về trước close. |
| Quên thêm label dịch ở một nơi hiển thị → hiện raw `contract_close_adjustment`. | Grep theo `translateTransactionType` và các object map; add test render nếu có. |
| `schema.sql` có enum/CHECK constraint chặn transaction_type mới → insert fail silently hoặc throw. | Kiểm tra schema trước khi code; thêm migration nếu cần. |
| Report `interestDetail` hiện không filter type → adjustment lẫn vào "tổng lãi" làm sai báo cáo. | Audit query report, thêm filter loại `contract_close_adjustment`. |

## 7. Test plan

- **Happy path**: Chuộc đồ với customAmount = +50k, note "Thu phí lưu kho". Verify: row mới trong `pawn_history`, quỹ tăng 50k trong Transaction Summary, Cashbook, Dashboard, Total fund, Daily snapshot.
- **Âm**: Chuộc đồ với customAmount = -30k, note "Làm tròn giảm". Verify: quỹ giảm 30k.
- **Không note**: customAmount = +10k, note trống. Verify: row ghi với description = "".
- **Skip**: customAmount = 0. Verify: không có row nào được insert.
- **Reopen**: close có adjustment → reopen → verify adjustment row có `is_deleted=true` và `is_created_from_contract_closure=false`, mọi aggregate trở về state trước close.
- **Close → reopen → close lại với adjustment mới**: verify 2 row độc lập, reopen lần 2 chỉ revert row mới nhất.
- **Thanh lý không trả nợ**: cũng hoạt động như Chuộc đồ.
- **Report contractClose**: adjustment xuất hiện trong export.
- **Report interestDetail**: adjustment KHÔNG được cộng vào tổng lãi.
- **PawnHistoryModal**: row mới hiển thị với label "Điều chỉnh khi đóng HĐ" + note.
