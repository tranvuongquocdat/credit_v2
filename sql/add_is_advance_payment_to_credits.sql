-- Thêm cột is_advance_payment vào bảng credits (tín chấp)
-- Đánh dấu hợp đồng thu lãi trước (trả lãi kỳ đầu ngay khi ký) hay không
-- Mirror từ pawns.is_advance_payment bên v2 gold (migration 20260425000000)
--
-- CHẠY TAY TRÊN SUPABASE SQL EDITOR

ALTER TABLE "public"."credits"
  ADD COLUMN IF NOT EXISTS "is_advance_payment" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "public"."credits"."is_advance_payment"
  IS 'true = hợp đồng thu lãi trước; hạn đóng lãi tính theo ngày đầu kỳ kế tiếp thay vì ngày cuối kỳ';

-- ============================================================
-- Rebuild credits_by_store view với logic thu lãi trước
-- DROP trước vì c.* sẽ tự thêm cột mới (is_advance_payment) làm thay đổi thứ tự column,
-- Postgres không cho CREATE OR REPLACE khi structure thay đổi.
-- ============================================================

DROP VIEW IF EXISTS credits_by_store;

CREATE VIEW credits_by_store AS
SELECT
  c.*,
  -- Calculate status_code based on the same logic as get_credit_statuses RPC
  CASE
    -- 1. Static status mapping (direct from DB)
    WHEN c.status IN ('closed', 'deleted', 'bad_debt') THEN
      UPPER(c.status::text)  -- → CLOSED | DELETED | BAD_DEBT

    -- 2. Contract end date check (Overdue)
    WHEN (c.loan_date::date + (c.loan_period - 1) * INTERVAL '1 day')::date < CURRENT_DATE THEN
      'OVERDUE'

    -- 3. Late interest check
    --    Hợp đồng thu lãi trước (đã có thanh toán): hạn đóng = latest_paid + 1 (ngày đầu kỳ kế)
    --    → trễ khi today >= latest_paid + 2 (1 ngày sau hạn)
    WHEN c.is_advance_payment AND lp.latest_payment_date IS NOT NULL AND (
      lp.latest_payment_date + INTERVAL '2 day'
    )::date <= CURRENT_DATE THEN
      'LATE_INTEREST'
    --    Còn lại (hợp đồng thường, hoặc advance nhưng chưa có payment record):
    --    giữ nguyên logic cũ — trễ khi quá ngày cuối kỳ
    WHEN (
      COALESCE(lp.latest_payment_date, c.loan_date::date)
      + (COALESCE(c.interest_period, 30) * INTERVAL '1 day')
    )::date <= CURRENT_DATE THEN
      'LATE_INTEREST'

    -- 4. Default: On time
    ELSE 'ON_TIME'
  END AS status_code,

  -- Calculate next_payment_date based on get_next_payment_info RPC logic
  CASE
    -- Hợp đồng thu lãi trước (đã có thanh toán): hạn đóng = ngày đầu kỳ lãi tiếp theo
    WHEN c.is_advance_payment AND lp.latest_payment_date IS NOT NULL THEN
      (lp.latest_payment_date + INTERVAL '1 day')::date

    -- Còn lại (giữ nguyên logic cũ): hạn đóng = ngày cuối kỳ
    WHEN lp.latest_payment_date IS NULL THEN
      -- No payments yet: loan_date + (interest_period - 1) days
      (c.loan_date::date + (COALESCE(c.interest_period, 30) - 1) * INTERVAL '1 day')::date
    ELSE
      -- Has payments: last_paid + interest_period days
      (lp.latest_payment_date + COALESCE(c.interest_period, 30) * INTERVAL '1 day')::date
  END AS next_payment_date,

  -- Add completion and payment status flags for consistency with RPC
  CASE
    WHEN lp.latest_payment_date IS NULL THEN false
    WHEN lp.latest_payment_date >= (c.loan_date::date + (c.loan_period - 1) * INTERVAL '1 day')::date THEN true
    ELSE false
  END AS is_completed,

  (lp.latest_payment_date IS NOT NULL) AS has_paid

FROM credits c

-- Left join to get latest payment date
LEFT JOIN (
  SELECT
    credit_id,
    MAX(effective_date)::date AS latest_payment_date
  FROM credit_history
  WHERE transaction_type = 'payment'
    AND is_deleted = false
  GROUP BY credit_id
) lp ON lp.credit_id = c.id;

COMMENT ON VIEW credits_by_store IS 'Enhanced view with pre-calculated status_code and next_payment_date for credits, mirroring get_credit_statuses and get_next_payment_info RPC logic. Hỗ trợ is_advance_payment: hạn đóng = ngày đầu kỳ kế (thu lãi trước) thay vì ngày cuối kỳ.';
