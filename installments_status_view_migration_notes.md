# Ghi chú kỹ thuật: Chuyển đổi filter trạng thái động cho Installments

## Hiện trạng
- View gốc `installments_by_store` **chưa** có cột `status_code` động (OVERDUE, LATE_INTEREST, ...).
- Để filter các trạng thái này, hiện phải gọi RPC `get_installment_statuses` và truyền mảng ID lên server, gây phức tạp và không tối ưu khi số lượng hợp đồng lớn.

## Xử lý tạm thời
- Đã tạo view tạm thời `installments_by_store_tmp` với cột `status_code` tính trực tiếp bằng SQL:
  - Tính toán trạng thái động ngay trong view (OVERDUE, LATE_INTEREST, ...)
  - Truy vấn bảng/totals chỉ cần filter theo `status_code`, pagination và tổng hợp luôn chính xác.
- Các truy vấn/totals tạm thời chuyển sang dùng view này.

## Ưu điểm
- Đơn giản hóa code FE: chỉ cần filter theo `status_code`, không cần gọi RPC phụ.
- Giảm số lượng round-trip và băng thông giữa FE ↔ BE.
- Pagination, totals luôn khớp với filter.

## Nhược điểm & rủi ro
- View phải tính trạng thái động mỗi lần SELECT, có thể chậm nếu dữ liệu lớn.
- Nếu bảng `installment_history` lớn, cần index phù hợp để tránh full scan.
- Nếu chuyển sang materialized view để tăng tốc, cần cron/trigger refresh định kỳ (dữ liệu có thể trễ).

## Việc cần làm tiếp
1. **Theo dõi hiệu năng**: Dùng `EXPLAIN ANALYZE` để kiểm tra truy vấn thực tế, thêm index nếu cần:
   ```sql
   CREATE INDEX ON installment_history (installment_id, transaction_type, is_deleted, effective_date DESC);
   ```
2. **Quyết định giải pháp dài hạn**:
   - Giữ view + index nếu hiệu năng ổn.
   - Chuyển sang materialized view hoặc generated column nếu cần truy vấn cực nhanh.
   - Khi ổn định, đổi tên view thành `installments_by_store` chính thức, cập nhật lại code, xóa `_tmp`.
3. **Cập nhật code FE**:
   - Bỏ các đoạn gọi RPC `get_installment_statuses`/`useInstallmentStatuses`.
   - Filter chỉ dùng `status_code` để đồng nhất với credit.

---
**Tóm lại:**
View tạm thời với `status_code` giúp đơn giản hóa filter trạng thái động, pagination và tổng hợp luôn chính xác, nhưng cần theo dõi hiệu năng và chuẩn bị phương án tối ưu lâu dài nếu dữ liệu lớn. 