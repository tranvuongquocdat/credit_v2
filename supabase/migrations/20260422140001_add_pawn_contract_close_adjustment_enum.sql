-- Thêm giá trị enum mới cho pawn_transaction_type: contract_close_adjustment
-- Dùng cho tính năng "Tiền tùy chỉnh" khi chuộc đồ / thanh lý hợp đồng cầm đồ.
-- Nhân viên có thể nhập thêm 1 khoản tiền (dương hoặc âm) kèm note khi đóng HĐ.
-- Row này ghi vào pawn_history với transaction_type = 'contract_close_adjustment',
-- is_created_from_contract_closure = true để reopen revert được.

ALTER TYPE public.pawn_transaction_type ADD VALUE IF NOT EXISTS 'contract_close_adjustment';
