# useTransactionSummary.ts - Tài liệu phân tích

> **Ngày tạo:** 2026-04-15
> **File gốc:** `src/hooks/useTransactionSummary.ts`

---

## 1. Tổng quan

File `useTransactionSummary.ts` là một React Query hook cung cấp dữ liệu **tổng kết giao dịch** theo ngày cho một cửa hàng, bao gồm:

- **Số dư đầu kỳ** (tiền mặt tại thời điểm bắt đầu ngày)
- **Số dư cuối kỳ** (tiền mặt hiện tại của cửa hàng)
- **Tổng hợp thu/chi** theo từng nguồn (Cầm đồ, Tín chấp, Trả góp, Nguồn vốn, Thu chi hoạt động)
- **Chi tiết giao dịch** (danh sách từng dòng giao dịch)

---

## 2. Các function xử lý chính

### 2.1. `fetchAllData(query, pageSize = 1000)`

**Mục đích:** Fetch tất cả dữ liệu từ Supabase với pagination (1000 rows/lần) để tránh giới hạn page size mặc định.

**Logic:**
```
1. Khởi tạo mảng rỗng `allData`
2. Loop:
   - Fetch từng trang 1000 rows
   - Append vào `allData`
   - Nếu số rows trả về < 1000 → dừng
3. Trả về toàn bộ data
```

---

### 2.2. `fetchOpeningBalance(storeId, startDate)`

**Mục đích:** Lấy số dư đầu ngày (tiền mặt đầu ngày được chọn).

**Logic:**

```
1. Lấy `created_at` của store từ bảng `stores`
2. Nếu ngày xem = ngày tạo store → return 0
3. Từ bảng `store_total_fund`:
   - Lấy record gần nhất có created_at <= startDate (00:00 UTC+7)
   - Trả về `total_fund` của record đó
4. Nếu không có record → return 0
```

**Database truy vấn:**

| Bảng | Columns | Điều kiện |
|------|---------|-----------|
| `stores` | `created_at` | `id = storeId` |
| `store_total_fund` | `total_fund, created_at` | `store_id = storeId`, `created_at <= startDate` |

---

### 2.3. `fetchClosingBalance(storeId)`

**Mục đích:** Lấy số dư cuối ngày (tiền mặt hiện tại của cửa hàng).

**Logic:**
```
1. Từ bảng `stores`:
   - Lấy field `cash_fund`
2. Return `cash_fund` hoặc 0
```

**Database truy vấn:**

| Bảng | Columns | Điều kiện |
|------|---------|-----------|
| `stores` | `cash_fund` | `id = storeId` |

---

### 2.4. `fetchEmployees(storeId)`

**Mục đích:** Lấy danh sách nhân viên đang làm việc của cửa hàng (để filter dropdown).

**Logic:**
```
1. Từ bảng `employees`:
   - Join `profiles` (inner) để lấy `username`
   - Filter: `store_id = storeId`, `status = 'working'`, `full_name IS NOT NULL`
   - Order by `full_name`
2. Transform data: flatten thành `{ full_name, username }`
```

**Database truy vấn:**

| Bảng | Columns | Điều kiện |
|------|---------|-----------|
| `employees` + `profiles` | `full_name`, `username` | `store_id = storeId`, `status = 'working'` |

---

### 2.5. `fetchTransactionData()` — tổng hợp thu/chi theo nguồn

**Mục đích:** Tính tổng thu/chi theo từng nguồn giao dịch.

#### 2.5.1. Fetch dữ liệu từ 5 bảng

**a) `credit_history` (Tín chấp)**

Columns được select: `id`, `created_at`, `updated_at`, `is_deleted`, `transaction_type`, `credit_amount`, `debit_amount`, `created_by`, `credits(contract_code, store_id, customers(name))`, `profiles:created_by(username)`

Điều kiện query:
- `credits.store_id = storeId`
- `OR( created_at in [startDate, endDate], (transaction_type = 'payment' AND is_deleted = true AND updated_at in [startDate, endDate]) )`

**b) `pawn_history` (Cầm đồ)**

Cùng cấu trúc như `credit_history`, thêm `pawns.collateral_detail` (JSON) để lấy tên tài sản cầm.

Điều kiện query:
- `pawns.store_id = storeId`
- `OR( created_at in [startDate, endDate], (transaction_type = 'payment' AND is_deleted = true AND updated_at in [startDate, endDate]) )`

**c) `installment_history` (Trả góp)**

Cùng cấu trúc như `credit_history`, nhưng:
- Join qua `installments.employees.store_id` thay vì trực tiếp
- **Loại trừ** `transaction_type NOT IN ('contract_close', 'contract_rotate')`

**d) `store_fund_history` (Nguồn vốn)**

Columns: `id`, `created_at`, `transaction_type`, `fund_amount`, `name`

Điều kiện:
- `store_id = storeId`
- `created_at BETWEEN startDate AND endDate`

**e) `transactions` (Thu chi hoạt động)**

Columns: `id`, `created_at`, `update_at`, `is_deleted`, `credit_amount`, `debit_amount`, `amount`, `transaction_type`, `employee_name`, `customers:customer_id(name)`

Điều kiện:
- `store_id = storeId`
- `created_at BETWEEN startDate AND endDate`

#### 2.5.2. Logic xử lý amount cho từng nguồn

```
Cầm đồ / Tín chấp / Trả góp:
  amount = credit_amount - debit_amount
  - amount > 0 → income (thu)
  - amount < 0 → expense (chi)

Nguồn vốn:
  amount = transaction_type === 'withdrawal' ? -fund_amount : fund_amount
  - withdrawal → chi
  - deposit → thu

Thu chi hoạt động:
  amount = credit_amount - debit_amount
  Nếu amount = 0 → dùng: transaction_type === 'expense' ? -amount : amount
```

#### 2.5.3. Logic xử lý giao dịch bị hủy (Payment cancellation)

```
Với transaction_type = 'payment' VÀ is_deleted = true:
  1. Tạo dòng gốc với amount đã tính
  2. Tạo thêm dòng "Huỷ đóng lãi" vào ngày updated_at:
     - amount đảo ngược (income ↔ expense)
```

#### 2.5.4. Aggregation & Grouping

```
1. Group theo key: contractCode-dateString-transactionType-source-description
2. Cộng dồn income và expense của các dòng trùng key
3. Nếu có nhiều ngày, lấy ngày mới nhất
4. Sort theo ngày giảm dần
5. Filter theo selectedTransactionType (nếu != 'all')
6. Filter theo selectedEmployee (nếu != 'all')
```

---

### 2.6. `fetchTransactionDetails()` — chi tiết từng dòng

Logic giống hệt `fetchTransactionData()`, chỉ khác:
- **KHÔNG aggregate** (giữ nguyên từng dòng)
- Vẫn apply filter `selectedTransactionType` và `selectedEmployee`

---

## 3. Các hook được export

| Hook | Query Key | staleTime | gcTime |
|------|-----------|-----------|--------|
| `useTransactionSummaryOpeningBalance` | `transactionSummary.openingBalance` | 10 phút | 30 phút |
| `useTransactionSummaryClosingBalance` | `transactionSummary.closingBalance` | 2 phút | 10 phút |
| `useTransactionSummaryEmployees` | `transactionSummary.employees` | 15 phút | 30 phút |
| `useTransactionSummaryData` | `transactionSummary.summary` | 5 phút | 15 phút |
| `useTransactionSummaryDetails` | `transactionSummary.transactionDetails` | 5 phút | 15 phút |
| **`useTransactionSummary`** | (composite) | — | — |

---

## 4. Các màn hình sử dụng hook này

### 4.1. Tổng kết giao dịch

| Thông tin | Chi tiết |
|-----------|----------|
| **Route** | `/reports/transactionSummary` |
| **File** | `src/app/reports/transactionSummary/page.tsx` |
| **Hook sử dụng** | `useTransactionSummary` |
| **Components** | `TransactionDetailsTable`, `ExcelExport` |
| **Permission** | `tong_ket_giao_dịch` |

**Màn hình hiển thị:**
- Bảng tổng kết: Số dư đầu, Thu/Chi theo 5 nguồn, Số dư cuối
- Bảng chi tiết giao dịch: Từng dòng thu/chi với filter
- Export Excel: Xuất file báo cáo

---

## 5. Database Schema liên quan

### 5.1. Các bảng chính

| Bảng | Mục đích | Key columns |
|------|----------|-------------|
| `stores` | Thông tin cửa hàng | `id`, `created_at`, `cash_fund` |
| `store_total_fund` | Lịch sử số dư quỹ | `store_id`, `total_fund`, `created_at` |
| `employees` | Nhân viên | `store_id`, `full_name`, `status` |
| `profiles` | Tài khoản user | `username` (join với employees) |

### 5.2. Các bảng lịch sử giao dịch

| Bảng | Nguồn | Key columns |
|------|-------|-------------|
| `credit_history` | Tín chấp | `id`, `transaction_type`, `credit_amount`, `debit_amount`, `is_deleted`, `created_by` |
| `pawn_history` | Cầm đồ | `id`, `transaction_type`, `credit_amount`, `debit_amount`, `is_deleted`, `created_by` |
| `installment_history` | Trả góp | `id`, `transaction_type`, `credit_amount`, `debit_amount`, `is_deleted`, `created_by` |
| `store_fund_history` | Nguồn vốn | `id`, `transaction_type`, `fund_amount` |
| `transactions` | Thu chi | `id`, `transaction_type`, `credit_amount`, `debit_amount`, `amount`, `is_deleted` |

### 5.3. Các bảng tham chiếu (Join)

| Bảng | Join từ | Mục đích |
|------|---------|----------|
| `credits` | `credit_history` | `contract_code`, `store_id`, `customer_id` |
| `pawns` | `pawn_history` | `contract_code`, `store_id`, `customer_id`, `collateral_detail` |
| `installments` | `installment_history` | `contract_code`, `employee_id`, `customer_id` |
| `customers` | credits/pawns/installments/transactions | `name` |

---

## 6. Các transaction_type được xử lý

| transaction_type | Tiếng Việt | Nguồn | Ghi chú |
|-----------------|------------|-------|---------|
| `payment` | Đóng lãi / Huỷ đóng lãi | Cầm đồ, Tín chấp, Trả góp | Có xử lý hủy |
| `loan` | Cho vay | Cầm đồ, Tín chấp, Trả góp | |
| `additional_loan` | Vay thêm | Cầm đồ, Tín chấp, Trả góp | |
| `principal_repayment` | Trả gốc | Cầm đồ, Tín chấp, Trả góp | |
| `contract_close` | Đóng HĐ | Cầm đồ, Tín chấp | Trả góp: **LOẠI TRỪ** |
| `contract_reopen` | Mở lại HĐ | Cầm đồ, Tín chấp | |
| `debt_payment` | Trả nợ | Cầm đồ, Tín chấp, Trả góp | |
| `extension` | Gia hạn | Cầm đồ, Tín chấp, Trả góp | |
| `deposit` | Nộp tiền | Nguồn vốn | |
| `withdrawal` | Rút tiền | Nguồn vốn | |
| `income` | Thu nhập | Thu chi | |
| `expense` | Chi phí | Thu chi | |
| `penalty` | Phạt | Thu chi | |
| `refund` | Hoàn tiền | Thu chi | |
| `thu_khac` / `chi_khac` | Thu/Chi khác | Thu chi | |
| `tra_luong` / `tam_ung` / ... | Các loại chi tiêu | Thu chi | |

---

## 7. Lưu ý quan trọng khi chỉnh sửa

### 7.1. Điểm cần thận trọng

1. **Logic hủy giao dịch payment:**
   - Dòng hủy có `id = gốc + "-cancel"`, ngày = `updated_at`
   - Amount đảo ngược (income ↔ expense)
   - Chỉ áp dụng khi `is_deleted = true`

2. **Installment loại trừ `contract_close` và `contract_rotate`:**
   - Khác với Cầm đồ và Tín chấp, 2 loại này bị loại khỏi query qua `.not()`

3. **Date filter phức tạp trong history tables:**
   - Có 2 điều kiện OR: `(created_at in range)` OR `(payment deleted & updated_at in range)`
   - Đảm bảo cả 2 điều kiện được giữ nguyên

4. **Join direction khác nhau giữa 3 bảng history:**
   - `credit_history` → `credits.store_id` (trực tiếp)
   - `pawn_history` → `pawns.store_id` (trực tiếp)
   - `installment_history` → `installments.employees.store_id` (phải qua bảng trung gian)

5. **Date timezone:**
   - `fetchOpeningBalance` dùng `17:00:00Z` (tức 00:00 UTC+7)
   - Các query history dùng `startOfDay`/`endOfDay` từ `date-fns` → ISO string

### 7.2. Impact khi thay đổi

| Thay đổi | Impact |
|----------|--------|
| Thêm/đổi transaction_type | Ảnh hưởng tất cả 3 bảng history |
| Đổi logic amount calculation | Ảnh hưởng số thu/chi trên Tổng kết giao dịch |
| Đổi date filter | Ảnh hưởng dữ liệu hiển thị theo ngày |
| Đổi aggregation key | Ảnh hưởng grouping trên chi tiết giao dịch |
| Thêm bảng nguồn mới | Phải thêm trong cả `fetchTransactionData` và `fetchTransactionDetails` |

---

## 8. Cấu trúc data trả về

### 8.1. `fetchTransactionData` returns

```typescript
{
  pawn: { income: number; expense: number };
  credit: { income: number; expense: number };
  installment: { income: number; expense: number };
  incomeExpense: { income: number; expense: number };
  capital: { income: number; expense: number };
}
```

### 8.2. `fetchTransactionDetails` returns

```typescript
FundHistoryItem[] = Array<{
  id: string;
  date: string;
  description: string;           // tiếng Việt (translate từ transaction_type)
  transactionType: string;       // tiếng Anh (gốc)
  source: 'Cầm đồ' | 'Tín chấp' | 'Trả góp' | 'Nguồn vốn' | 'Thu chi';
  income: number;
  expense: number;
  contractCode: string;
  employeeName: string;
  customerName: string;
  itemName: string;              // chỉ có ở Cầm đồ (tên tài sản cầm)
}>
```

**Lưu ý về `id` khi map dữ liệu:**
- Với các nguồn có thể trùng `id` số giữa nhiều bảng (`credit_history`, `pawn_history`, `installment_history`, ...), hook dùng format:
  - ``id: `${source.toLowerCase()}-${item.id}```
- Mục đích:
  - Tạo **ID duy nhất toàn cục** cho từng dòng sau khi gộp nhiều nguồn vào một mảng chung.
  - Tránh đụng key khi render danh sách (`React key`) và khi map/so sánh dữ liệu theo `id`.
  - Giữ khả năng truy vết ngược về nguồn dữ liệu ban đầu qua prefix (`cam do`, `tin chap`, `tra gop`, ...).

---

## 9. Related files

| File | Mối quan hệ |
|------|-------------|
| `src/lib/query-keys.ts` | Định nghĩa query keys cho cache |
| `src/app/reports/transactionSummary/page.tsx` | Màn hình chính sử dụng hook |
| `src/app/reports/transactionSummary/components/TransactionDetailsTable.tsx` | Component hiển thị chi tiết |
| `src/app/reports/transactionSummary/components/ExcelExport.tsx` | Component export Excel |
| `src/app/reports/transactionSummary/types.ts` | Type definitions |
