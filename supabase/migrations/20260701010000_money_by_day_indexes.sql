-- (TÙY CHỌN) Index hỗ trợ rpc_money_by_day_loans_debt khi xem dải ngày rộng / data lớn dần.
-- ADDITIVE, an toàn. Nên chạy CONCURRENTLY (ngoài transaction) để không khoá bảng hot.
-- Nếu SQL editor báo lỗi CONCURRENTLY-trong-transaction, bỏ chữ CONCURRENTLY (khoá vài giây).
create index concurrently if not exists idx_installment_history_id_created
  on installment_history (installment_id, created_at) where is_deleted = false;
create index concurrently if not exists idx_credit_history_id_created
  on credit_history (credit_id, created_at) where is_deleted = false;
create index concurrently if not exists idx_pawn_history_id_created
  on pawn_history (pawn_id, created_at) where is_deleted = false;
