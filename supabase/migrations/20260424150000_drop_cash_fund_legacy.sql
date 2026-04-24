-- PR3: Dọn legacy cash_fund state. Sau PR2 event-sourced, không còn ai đọc
-- stores.cash_fund hay store_total_fund ở client. Migration này gỡ sạch:
--   1. 5 triggers pawn sync cash_fund (khi tạo/sửa/đóng pawn, đóng/huỷ lãi pawn)
--   2. 5 trigger functions tương ứng
--   3. Cột stores.cash_fund
--   4. Bảng store_total_fund (cùng cron snapshot)
--
-- QUAN TRỌNG — TRƯỚC KHI CHẠY:
--   ✓ Đã deploy code PR2 + PR3 lên production (không còn ai đọc cash_fund)
--   ✓ Đã verify UI hiển thị đúng bằng RPC
--   ✓ Nếu dùng Supabase cron cho daily_fund_snapshot: UNSCHEDULE trước (thủ công
--     qua dashboard Database → Cron) vì cron sẽ fail khi table biến mất
--
-- Migration này KHÔNG reversible hoàn toàn (drop column mất data). Đã backup
-- state hiện tại qua drift_report.xlsx nếu cần đối chiếu sau.

BEGIN;

-- === 1. Drop 5 pawn cash_fund triggers ===
DROP TRIGGER IF EXISTS trigger_pawn_create_cash_fund ON pawns;
DROP TRIGGER IF EXISTS trigger_pawn_update_cash_fund ON pawns;
DROP TRIGGER IF EXISTS trigger_pawn_close_cash_fund ON pawns;
DROP TRIGGER IF EXISTS trigger_pawn_payment_cash_fund ON pawn_payment_periods;
DROP TRIGGER IF EXISTS trigger_pawn_payment_delete_cash_fund ON pawn_payment_periods;

-- === 2. Drop trigger functions ===
DROP FUNCTION IF EXISTS update_cash_fund_on_pawn_create() CASCADE;
DROP FUNCTION IF EXISTS update_cash_fund_on_pawn_update() CASCADE;
DROP FUNCTION IF EXISTS update_cash_fund_on_pawn_close() CASCADE;
DROP FUNCTION IF EXISTS update_cash_fund_on_pawn_payment() CASCADE;
DROP FUNCTION IF EXISTS update_cash_fund_on_pawn_payment_delete() CASCADE;

-- === 3. Drop cột stores.cash_fund ===
-- Nếu có constraint/view phụ thuộc → CASCADE sẽ gỡ theo
ALTER TABLE stores DROP COLUMN IF EXISTS cash_fund CASCADE;

-- === 4. Drop bảng store_total_fund ===
DROP TABLE IF EXISTS store_total_fund CASCADE;

-- === 5. (Optional) Drop RPC calc_cash_fund_from_all_sources ===
-- RPC cũ không còn ai gọi sau PR3. Giữ hoặc drop tuỳ bạn.
-- DROP FUNCTION IF EXISTS calc_cash_fund_from_all_sources(uuid);

-- Verify — sau khi COMMIT, các query này phải báo lỗi "does not exist":
--   SELECT cash_fund FROM stores LIMIT 1;
--   SELECT * FROM store_total_fund LIMIT 1;

COMMIT;

-- Sau khi COMMIT thành công:
-- - Nhớ regenerate database.types.ts: `npm run update-types`
-- - Gỡ cron daily_fund_snapshot trên Supabase dashboard (nếu đã schedule)
