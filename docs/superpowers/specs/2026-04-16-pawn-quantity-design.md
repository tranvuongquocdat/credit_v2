# Design: Thêm trường Số lượng vào hợp đồng cầm đồ

## Tóm tắt

Thêm trường `quantity` (số lượng) optional vào hợp đồng cầm đồ, lưu trong `collateral_detail` JSON. Trường này chỉ để lưu và hiển thị, không tham gia tính toán.

## Lưu trữ

Không thay đổi database. `quantity` được lưu vào field `collateral_detail` (kiểu `json`) hiện có:

```json
{
  "name": "Nhẫn vàng 18k",
  "quantity": 3,
  "attributes": {
    "attr_01": "...",
    "attr_02": "..."
  }
}
```

Nếu không nhập, `quantity` không được lưu (undefined/omitted).

## Các file thay đổi

### 1. `src/models/pawn.ts`
Cập nhật type `collateral_detail` thêm `quantity?: number`.

### 2. `src/components/Pawns/PawnCreateModal.tsx`
- Thêm state `collateralQuantity: string`
- Thêm field "Số lượng" (input số, optional, min=1, placeholder="1") ngay sau field "Tên tài sản"
- Đưa `quantity` vào `collateralDetailJson` khi submit (chỉ nếu có giá trị)

### 3. `src/components/Pawns/PawnEditModal.tsx`
- Thêm state `collateralQuantity: string`
- Load `quantity` từ `collateral_detail` khi mở modal
- Thêm field "Số lượng" ngay sau field "Tên tài sản"
- Đưa `quantity` vào `collateralDetailJson` khi submit

### 4. `src/components/Pawns/PawnTable.tsx`
Hiển thị số lượng sau tên tài sản: `Nhẫn vàng 18k (x3)` nếu có quantity.

### 5. `src/components/Pawns/PawnHistoryModal.tsx`
Hiển thị tương tự PawnTable.

### 6. `src/components/Pawns/tabs/DocumentsTab.tsx`
Hiển thị tương tự PawnTable.

### 7. `src/components/Pawns/PawnWarningsTable.tsx`
Hiển thị tương tự PawnTable.

## Format hiển thị

- Có quantity: `{name} (x{quantity})` — ví dụ `Nhẫn vàng 18k (x3)`
- Không có quantity: chỉ hiển thị `{name}`
