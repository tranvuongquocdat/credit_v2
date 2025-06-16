# Hệ thống cập nhật Cash Fund tự động

## Tổng quan
Đã triển khai hệ thống tự động cập nhật `cash_fund` trong bảng `stores` khi có thay đổi dữ liệu từ các nguồn khác nhau, giải quyết vấn đề quỹ tiền mặt không được cập nhật ngay lập tức.

## Các thành phần chính

### 1. Function cập nhật tổng hợp (`src/lib/store.ts`)
```typescript
updateCashFundFromAllSources(storeId: string)
```
- Tính toán lại tổng quỹ từ tất cả nguồn dữ liệu
- Cập nhật cả `store_total_fund` và `stores.cash_fund`
- Xử lý dữ liệu từ: credit_history, pawn_history, installment_history, store_fund_history, transactions

### 2. Hook tự động cập nhật (`src/hooks/useCashFundUpdater.ts`)
```typescript
useAutoUpdateCashFund(options)
```
- Wrapper hook để gọi `updateCashFundFromAllSources`
- Có delay để đảm bảo transaction đã commit
- Callback cho success/error handling

### 3. FinancialSummary Component cải tiến (`src/components/common/FinancialSummary.tsx`)
- Thêm prop `enableCashFundUpdate` để bật/tắt tính năng
- Icon refresh có animation khi đang cập nhật
- Tự động gọi `updateCashFundFromAllSources` khi được bật

## Triển khai trên các page

### Pages đã được cập nhật:
1. **Pawns Page** (`src/app/pawns/page.tsx`)
   - Trigger update khi: tạo mới, chỉnh sửa, xóa, thay đổi payment history
   - Sử dụng `enableCashFundUpdate={true}` trong FinancialSummary

2. **Credits Page** (`src/app/credits/page.tsx`)
   - Trigger update khi: tạo mới, chỉnh sửa, xóa, thay đổi payment history
   - Sử dụng `enableCashFundUpdate={true}` trong FinancialSummary

3. **Installments Page** (`src/app/installments/page.tsx`)
   - Trigger update khi: tạo mới, chỉnh sửa, xóa, thay đổi payment history
   - Sử dụng `enableCashFundUpdate={true}` trong FinancialSummary

4. **Income Page** (`src/app/income/page.tsx`)
   - Thêm FinancialSummary component với `enableCashFundUpdate={true}`
   - Trigger update khi: tạo mới, chỉnh sửa, xóa transaction

5. **Outgoing Page** (`src/app/outgoing/page.tsx`)
   - Thêm FinancialSummary component với `enableCashFundUpdate={true}`
   - Trigger update khi: tạo mới, chỉnh sửa, xóa transaction

6. **Capital Page** (`src/app/capital/page.tsx`)
   - Trigger update sau các thao tác CRUD (vẫn giữ logic cũ + thêm trigger)

## Cơ chế hoạt động

### Trước đây:
- Capital page: Cập nhật `cash_fund` trực tiếp qua `updateStoreCashFund()`
- Các page khác: KHÔNG cập nhật `cash_fund`, chỉ khi vào `/total-fund` mới được tính lại

### Bây giờ:
- **Tất cả pages**: Tự động trigger cập nhật `cash_fund` sau mọi thao tác CRUD
- **Cơ chế tính toán**: Giống hệt logic trong `/total-fund` page
- **Performance**: Sử dụng parallel processing và smart data limiting

## Luồng cập nhật

1. **User thực hiện thao tác** (tạo/sửa/xóa)
2. **Page gọi `triggerUpdate()`** với delay 1 giây
3. **Hook gọi `updateCashFundFromAllSources()`**
4. **Function tính toán lại tổng quỹ** từ tất cả nguồn
5. **Cập nhật database**: `store_total_fund` + `stores.cash_fund`
6. **Callback refresh** dữ liệu financial summary

## Lợi ích

1. **Tính nhất quán**: Quỹ tiền mặt luôn được cập nhật ngay lập tức
2. **Trải nghiệm người dùng**: Không cần vào `/total-fund` để refresh
3. **Tự động hóa**: Không cần can thiệp thủ công
4. **Tính chính xác**: Sử dụng cùng logic tính toán với `/total-fund`
5. **Performance**: Optimized với parallel processing

## Cấu hình

### Bật/tắt tính năng:
```typescript
<FinancialSummary 
  enableCashFundUpdate={true}  // Bật tự động cập nhật
/>
```

### Tùy chỉnh callback:
```typescript
const { triggerUpdate } = useAutoUpdateCashFund({
  onUpdate: (newCashFund) => {
    console.log('Cash fund updated to:', newCashFund);
    // Custom logic here
  },
  onError: (error) => {
    console.error('Update failed:', error);
  }
});
```

## Tương thích ngược
- Tất cả logic cũ vẫn hoạt động bình thường
- `/total-fund` page vẫn là nguồn chính xác nhất
- Có thể tắt tính năng bằng cách set `enableCashFundUpdate={false}` 