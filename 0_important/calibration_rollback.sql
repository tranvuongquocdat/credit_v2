-- Drift calibration ROLLBACK
-- Gỡ toàn bộ record đã insert bởi calibration_apply.sql
-- Tag marker: [DRIFT_CALIBRATION_2026_04_24]
--
-- An toàn: chỉ xoá các record có note BẮT ĐẦU bằng "[DRIFT_CALIBRATION_2026_04_24]"
-- Không đụng đến bất kỳ record store_fund_history nào khác.

BEGIN;

-- Preview trước khi xoá
SELECT store_id, transaction_type, fund_amount, created_at, note
FROM store_fund_history
WHERE note LIKE '[DRIFT_CALIBRATION_2026_04_24]%';

-- Xoá
DELETE FROM store_fund_history
WHERE note LIKE '[DRIFT_CALIBRATION_2026_04_24]%';

-- Nếu output SELECT ở trên khớp với gì bạn muốn xoá → COMMIT:
COMMIT;

-- Nếu muốn huỷ → ROLLBACK:
-- ROLLBACK;
