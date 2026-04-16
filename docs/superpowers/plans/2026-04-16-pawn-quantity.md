# Pawn Quantity Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm trường `quantity` (số lượng, optional) vào hợp đồng cầm đồ — lưu trong `collateral_detail` JSON, hiển thị ở các màn hình liên quan, không ảnh hưởng tính toán.

**Architecture:** Không thay đổi database. `quantity` được nhét vào field `collateral_detail` (JSON) hiện có với cấu trúc `{name, quantity?, attributes}`. Frontend thêm input ở create/edit modal và render `{name} (x{quantity})` ở các nơi hiển thị.

**Tech Stack:** Next.js 15, TypeScript, React Hook Form (không dùng trong modal này — dùng useState trực tiếp), Tailwind CSS, shadcn/ui

---

## File Map

| File | Thay đổi |
|------|---------|
| `src/models/pawn.ts` | Thêm interface `CollateralDetail`, thay `collateral_detail?: any` bằng type mới |
| `src/components/Pawns/PawnCreateModal.tsx` | Thêm state `collateralQuantity`, field UI, và đưa vào JSON khi submit |
| `src/components/Pawns/PawnEditModal.tsx` | Thêm state `collateralQuantity`, load từ data, field UI, đưa vào JSON khi submit |
| `src/components/Pawns/PawnTable.tsx` | Hiển thị `{name} (x{qty})` ở 2 chỗ (desktop row + mobile card) |
| `src/components/Pawns/PawnHistoryModal.tsx` | Hiển thị `{name} (x{qty})` ở bảng thông tin |
| `src/components/Pawns/tabs/DocumentsTab.tsx` | Hiển thị `{name} (x{qty})` ở phần tài sản |
| `src/components/Pawns/PawnWarningsTable.tsx` | Hiển thị `{name} (x{qty})` ở cột tên tài sản |

---

### Task 1: Cập nhật TypeScript model

**Files:**
- Modify: `src/models/pawn.ts`

- [ ] **Step 1: Thêm interface `CollateralDetail` và cập nhật type**

Mở `src/models/pawn.ts`, thêm interface mới ngay trước `export interface Pawn` và thay `collateral_detail?: any | null` bằng type mới:

```typescript
// Thêm vào trước interface Pawn
export interface CollateralDetail {
  name: string;
  quantity?: number;
  attributes?: Record<string, string>;
}
```

Trong `interface Pawn`, `interface CreatePawnParams`, `interface UpdatePawnParams`, thay dòng:
```typescript
collateral_detail?: any | null;
```
thành:
```typescript
collateral_detail?: CollateralDetail | null;
```

(Với `CreatePawnParams` và `UpdatePawnParams` dùng `CollateralDetail` không có `| null`)

- [ ] **Step 2: Verify TypeScript compile không có lỗi**

```bash
cd "/Users/dat_macbook/Documents/2025/ý tưởng mới/Dự án web tiền/credit"
npx tsc --noEmit 2>&1 | head -30
```

Nếu có lỗi liên quan `collateral_detail`, fix cho đúng type. Các chỗ dùng `any` trước đây vẫn hoạt động vì interface có `attributes?: Record<string, string>`.

- [ ] **Step 3: Commit**

```bash
cd "/Users/dat_macbook/Documents/2025/ý tưởng mới/Dự án web tiền/credit"
git add src/models/pawn.ts
git commit -m "feat(pawn): add CollateralDetail type with optional quantity field"
```

---

### Task 2: Thêm field Số lượng vào PawnCreateModal

**Files:**
- Modify: `src/components/Pawns/PawnCreateModal.tsx`

- [ ] **Step 1: Thêm state `collateralQuantity`**

Tìm dòng khai báo state `collateralName` (khoảng line 51):
```typescript
const [collateralName, setCollateralName] = useState('');
```

Thêm ngay sau:
```typescript
const [collateralQuantity, setCollateralQuantity] = useState<string>('');
```

- [ ] **Step 2: Reset quantity khi đóng/mở modal**

Tìm chỗ reset state khi modal đóng. Trong `useEffect` load collaterals hoặc khi `handleCollateralChange`, thêm reset:

Tìm hàm `handleCollateralChange` (khoảng line 254), thêm dòng reset:
```typescript
setCollateralQuantity('');
```

Và trong `useEffect` chính reset khi `isOpen` thay đổi (nếu có), hoặc đảm bảo khi modal mở lại quantity về rỗng — kiểm tra xem modal có reset state khi đóng không. Nếu không có, thêm vào `useEffect([isOpen])`:
```typescript
if (!isOpen) {
  setCollateralQuantity('');
}
```

- [ ] **Step 3: Thêm field UI ngay sau "Tên tài sản"**

Tìm block "Tên tài sản" (khoảng line 647-658):
```tsx
<div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
  <Label htmlFor="collateralName" className="text-left sm:text-right font-medium">
    Tên tài sản <span className="text-red-500">*</span>
  </Label>
  <Input 
    id="collateralName"
    value={collateralName}
    onChange={(e) => setCollateralName(e.target.value)}
    placeholder="Ví dụ: Xe máy Honda Wave, Nhẫn vàng 18k..."
    required
  />
</div>
```

Thêm block sau đó:
```tsx
<div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
  <Label htmlFor="collateralQuantity" className="text-left sm:text-right font-medium">Số lượng</Label>
  <Input 
    id="collateralQuantity"
    type="number"
    value={collateralQuantity}
    onChange={(e) => setCollateralQuantity(e.target.value)}
    placeholder="1"
    min={1}
    className="w-full sm:w-24"
  />
</div>
```

- [ ] **Step 4: Đưa quantity vào JSON khi submit**

Tìm chỗ build `collateralDetailJson` trong `handleSubmit` (khoảng line 425):
```typescript
const collateralDetailJson = {
  name: collateralName,
  attributes: collateralAttributes
};
```

Thay bằng:
```typescript
const collateralDetailJson: CollateralDetail = {
  name: collateralName,
  ...(collateralQuantity && parseInt(collateralQuantity) > 0 
    ? { quantity: parseInt(collateralQuantity) } 
    : {}),
  attributes: collateralAttributes
};
```

Thêm import `CollateralDetail` ở đầu file:
```typescript
import { CreatePawnParams, InterestType, PawnStatus, CollateralDetail } from '@/models/pawn';
```

- [ ] **Step 5: Verify UI**

```bash
cd "/Users/dat_macbook/Documents/2025/ý tưởng mới/Dự án web tiền/credit"
npm run dev
```

Mở http://localhost:3000/pawns, click tạo hợp đồng cầm đồ mới. Kiểm tra field "Số lượng" xuất hiện ngay sau "Tên tài sản". Thử tạo hợp đồng với số lượng = 3, sau đó xem record trong Supabase dashboard để confirm `collateral_detail` có `quantity: 3`.

- [ ] **Step 6: Commit**

```bash
cd "/Users/dat_macbook/Documents/2025/ý tưởng mới/Dự án web tiền/credit"
git add src/components/Pawns/PawnCreateModal.tsx
git commit -m "feat(pawn): add quantity field to create modal"
```

---

### Task 3: Thêm field Số lượng vào PawnEditModal

**Files:**
- Modify: `src/components/Pawns/PawnEditModal.tsx`

- [ ] **Step 1: Thêm state `collateralQuantity`**

Tìm dòng khai báo state `collateralName` trong PawnEditModal (khoảng line 50), thêm ngay sau:
```typescript
const [collateralQuantity, setCollateralQuantity] = useState<string>('');
```

- [ ] **Step 2: Load quantity từ data hiện có**

Tìm block load `collateral_detail` (khoảng line 241-248):
```typescript
if (pawnData.collateral_detail && typeof pawnData.collateral_detail === 'object') {
  setCollateralName(pawnData.collateral_detail.name || '');
  setCollateralAttributes(pawnData.collateral_detail.attributes || {});
} else if (typeof pawnData.collateral_detail === 'string') {
  // Handle legacy string format
  setCollateralName(pawnData.collateral_detail);
  setCollateralAttributes({});
}
```

Thay bằng:
```typescript
if (pawnData.collateral_detail && typeof pawnData.collateral_detail === 'object') {
  setCollateralName(pawnData.collateral_detail.name || '');
  setCollateralAttributes(pawnData.collateral_detail.attributes || {});
  setCollateralQuantity(pawnData.collateral_detail.quantity?.toString() || '');
} else if (typeof pawnData.collateral_detail === 'string') {
  // Handle legacy string format
  setCollateralName(pawnData.collateral_detail);
  setCollateralAttributes({});
  setCollateralQuantity('');
}
```

- [ ] **Step 3: Thêm field UI ngay sau "Tên tài sản"**

Trong phần JSX của PawnEditModal, tìm block "Tên tài sản" (tương tự CreateModal). Thêm block sau đó:
```tsx
<div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
  <Label htmlFor="collateralQuantity" className="text-left sm:text-right font-medium">Số lượng</Label>
  <Input 
    id="collateralQuantity"
    type="number"
    value={collateralQuantity}
    onChange={(e) => setCollateralQuantity(e.target.value)}
    placeholder="1"
    min={1}
    className="w-full sm:w-24"
  />
</div>
```

- [ ] **Step 4: Đưa quantity vào JSON khi submit**

Tìm chỗ build `collateralDetailJson` trong `handleSubmit` của EditModal (khoảng line 342):
```typescript
const collateralDetailJson = {
  name: collateralName,
  attributes: collateralAttributes
};
```

Thay bằng:
```typescript
import { CollateralDetail } from '@/models/pawn'; // đảm bảo import này có ở đầu file

const collateralDetailJson: CollateralDetail = {
  name: collateralName,
  ...(collateralQuantity && parseInt(collateralQuantity) > 0 
    ? { quantity: parseInt(collateralQuantity) } 
    : {}),
  attributes: collateralAttributes
};
```

Kiểm tra import ở đầu file đã có `CollateralDetail` chưa:
```typescript
import { PawnStatus, UpdatePawnParams, Pawn, InterestType, CollateralDetail } from '@/models/pawn';
```

- [ ] **Step 5: Verify UI**

Mở modal sửa một hợp đồng đã có quantity. Kiểm tra field "Số lượng" load đúng giá trị. Sửa và save — confirm trong Supabase dashboard.

- [ ] **Step 6: Commit**

```bash
cd "/Users/dat_macbook/Documents/2025/ý tưởng mới/Dự án web tiền/credit"
git add src/components/Pawns/PawnEditModal.tsx
git commit -m "feat(pawn): add quantity field to edit modal"
```

---

### Task 4: Hiển thị số lượng ở các component

**Files:**
- Modify: `src/components/Pawns/PawnTable.tsx`
- Modify: `src/components/Pawns/PawnHistoryModal.tsx`
- Modify: `src/components/Pawns/tabs/DocumentsTab.tsx`
- Modify: `src/components/Pawns/PawnWarningsTable.tsx`

> **Helper pattern:** Dùng inline expression cho format `{name} (x{qty})`:
> ```tsx
> {pawn.collateral_detail?.name 
>   ? `${pawn.collateral_detail.name}${pawn.collateral_detail.quantity ? ` (x${pawn.collateral_detail.quantity})` : ''}`
>   : '-'}
> ```

- [ ] **Step 1: PawnTable — desktop row (line ~186)**

Tìm:
```tsx
{pawn.collateral_detail?.name || '-'}
```

Thay bằng:
```tsx
{pawn.collateral_detail?.name 
  ? `${pawn.collateral_detail.name}${pawn.collateral_detail.quantity ? ` (x${pawn.collateral_detail.quantity})` : ''}`
  : '-'}
```

- [ ] **Step 2: PawnTable — mobile card (line ~417-421)**

Tìm:
```tsx
{pawn.collateral_detail?.name && (
  <div className="text-sm text-gray-600">
    Tài sản: {pawn.collateral_detail?.name}
  </div>
)}
```

Thay bằng:
```tsx
{pawn.collateral_detail?.name && (
  <div className="text-sm text-gray-600">
    Tài sản: {pawn.collateral_detail.name}{pawn.collateral_detail.quantity ? ` (x${pawn.collateral_detail.quantity})` : ''}
  </div>
)}
```

- [ ] **Step 3: PawnHistoryModal (line ~550-556)**

Tìm:
```tsx
{currentPawn?.collateral_asset?.name || 
 (currentPawn?.collateral_detail && typeof currentPawn.collateral_detail === 'object' 
   ? currentPawn.collateral_detail.name 
   : currentPawn?.collateral_detail) || '-'}
```

Thay bằng:
```tsx
{currentPawn?.collateral_asset?.name || 
 (currentPawn?.collateral_detail && typeof currentPawn.collateral_detail === 'object' 
   ? `${currentPawn.collateral_detail.name}${currentPawn.collateral_detail.quantity ? ` (x${currentPawn.collateral_detail.quantity})` : ''}`
   : currentPawn?.collateral_detail) || '-'}
```

- [ ] **Step 4: DocumentsTab (line ~50-53)**

Tìm:
```tsx
{pawn.collateral_asset?.name || 
 (pawn.collateral_detail && typeof pawn.collateral_detail === 'object' 
   ? pawn.collateral_detail.name 
   : pawn.collateral_detail) || 'N/A'}
```

Thay bằng:
```tsx
{pawn.collateral_asset?.name || 
 (pawn.collateral_detail && typeof pawn.collateral_detail === 'object' 
   ? `${pawn.collateral_detail.name}${pawn.collateral_detail.quantity ? ` (x${pawn.collateral_detail.quantity})` : ''}`
   : pawn.collateral_detail) || 'N/A'}
```

- [ ] **Step 5: PawnWarningsTable (line ~229-232)**

Tìm:
```tsx
{pawn.collateral_asset?.name || 
 (pawn.collateral_detail && typeof pawn.collateral_detail === 'object' 
   ? pawn.collateral_detail.name 
   : pawn.collateral_detail) || 'N/A'}
```

Thay bằng:
```tsx
{pawn.collateral_asset?.name || 
 (pawn.collateral_detail && typeof pawn.collateral_detail === 'object' 
   ? `${pawn.collateral_detail.name}${pawn.collateral_detail.quantity ? ` (x${pawn.collateral_detail.quantity})` : ''}`
   : pawn.collateral_detail) || 'N/A'}
```

- [ ] **Step 6: TypeScript check**

```bash
cd "/Users/dat_macbook/Documents/2025/ý tưởng mới/Dự án web tiền/credit"
npx tsc --noEmit 2>&1 | head -30
```

Fix bất kỳ lỗi type nào phát sinh (thường do `.quantity` trên `any` — đã được fix ở Task 1).

- [ ] **Step 7: Verify UI**

Với hợp đồng đã có `quantity` trong data, kiểm tra:
- Danh sách hợp đồng: hiển thị `Nhẫn vàng 18k (x3)` ở cột tài sản
- Mobile card: hiển thị `Tài sản: Nhẫn vàng 18k (x3)`
- Mở PawnHistoryModal: bảng thông tin có `(x3)`
- Tab Documents: phần tài sản có `(x3)`
- Trang cảnh báo: cột tài sản có `(x3)`

Với hợp đồng **không có** `quantity`: hiển thị bình thường không có `(x...)`.

- [ ] **Step 8: Commit**

```bash
cd "/Users/dat_macbook/Documents/2025/ý tưởng mới/Dự án web tiền/credit"
git add src/components/Pawns/PawnTable.tsx \
        src/components/Pawns/PawnHistoryModal.tsx \
        src/components/Pawns/tabs/DocumentsTab.tsx \
        src/components/Pawns/PawnWarningsTable.tsx
git commit -m "feat(pawn): display quantity in pawn tables and modals"
```
