-- Thêm cột is_advance_payment vào bảng pawns
-- Đánh dấu hợp đồng cầm đồ có thu lãi trước (trả lãi kỳ đầu ngay khi ký) hay không

ALTER TABLE "public"."pawns"
  ADD COLUMN IF NOT EXISTS "is_advance_payment" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "public"."pawns"."is_advance_payment"
  IS 'true = hợp đồng thu lãi trước; ngày đến hạn đóng lãi tính theo ngày đầu kỳ kế tiếp thay vì ngày cuối kỳ';
