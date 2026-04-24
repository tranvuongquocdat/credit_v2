-- RPC: tính fund tại cuối mỗi ngày trong khoảng [p_start_date, p_end_date]
-- theo giờ Asia/Ho_Chi_Minh. Event-sourced: derive từ history tables, không đọc
-- stores.cash_fund (cột state bị drift). Xử lý giao dịch xoá muộn bằng pattern
-- "un-delete ngược thời gian": row is_deleted=true với updated_at > as_of_day
-- vẫn coi như active tại as_of_day đó.
--
-- Thuật toán: mỗi history row tạo 1 hoặc 2 events (delta, event_date):
--   - Row active: +delta tại created_at_date
--   - Row deleted: +delta tại created_at_date, -delta tại updated_at_date
-- Fund(D) = SUM(delta) of events where event_date <= D = running total.

DROP FUNCTION IF EXISTS public.calc_cash_fund_series(uuid, date, date);

CREATE OR REPLACE FUNCTION public.calc_cash_fund_series(
  p_store_id   uuid,
  p_start_date date,
  p_end_date   date
)
RETURNS TABLE (
  as_of_date  date,
  fund_total  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH events AS (
    -- credit_history: +delta at created_at
    SELECT
      (ch.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS event_date,
      (COALESCE(ch.credit_amount, 0) - COALESCE(ch.debit_amount, 0))::numeric AS delta
    FROM credit_history ch
    JOIN credits c ON c.id = ch.credit_id
    WHERE c.store_id = p_store_id
      AND (ch.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date

    UNION ALL
    -- credit_history: -delta at updated_at (nếu đã xoá)
    SELECT
      (ch.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS event_date,
      -(COALESCE(ch.credit_amount, 0) - COALESCE(ch.debit_amount, 0))::numeric AS delta
    FROM credit_history ch
    JOIN credits c ON c.id = ch.credit_id
    WHERE c.store_id = p_store_id
      AND ch.is_deleted = true
      AND (ch.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date

    UNION ALL
    -- pawn_history: +delta
    SELECT
      (ph.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      (COALESCE(ph.credit_amount, 0) - COALESCE(ph.debit_amount, 0))::numeric
    FROM pawn_history ph
    JOIN pawns p ON p.id = ph.pawn_id
    WHERE p.store_id = p_store_id
      AND (ph.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date

    UNION ALL
    -- pawn_history: -delta nếu đã xoá
    SELECT
      (ph.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      -(COALESCE(ph.credit_amount, 0) - COALESCE(ph.debit_amount, 0))::numeric
    FROM pawn_history ph
    JOIN pawns p ON p.id = ph.pawn_id
    WHERE p.store_id = p_store_id
      AND ph.is_deleted = true
      AND (ph.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date

    UNION ALL
    -- installment_history: +delta
    SELECT
      (ih.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      (COALESCE(ih.credit_amount, 0) - COALESCE(ih.debit_amount, 0))::numeric
    FROM installment_history ih
    JOIN installments i ON i.id = ih.installment_id
    JOIN employees    e ON e.id = i.employee_id
    WHERE e.store_id = p_store_id
      AND (ih.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date

    UNION ALL
    -- installment_history: -delta nếu đã xoá
    SELECT
      (ih.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      -(COALESCE(ih.credit_amount, 0) - COALESCE(ih.debit_amount, 0))::numeric
    FROM installment_history ih
    JOIN installments i ON i.id = ih.installment_id
    JOIN employees    e ON e.id = i.employee_id
    WHERE e.store_id = p_store_id
      AND ih.is_deleted = true
      AND (ih.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date

    UNION ALL
    -- transactions: +delta
    SELECT
      (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      (COALESCE(t.credit_amount, 0) - COALESCE(t.debit_amount, 0))::numeric
    FROM transactions t
    WHERE t.store_id = p_store_id
      AND (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date

    UNION ALL
    -- transactions: -delta nếu đã xoá (dùng update_at, không phải updated_at)
    SELECT
      (t.update_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      -(COALESCE(t.credit_amount, 0) - COALESCE(t.debit_amount, 0))::numeric
    FROM transactions t
    WHERE t.store_id = p_store_id
      AND t.is_deleted = true
      AND (t.update_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date

    UNION ALL
    -- store_fund_history: nạp/rút vốn (không có is_deleted)
    SELECT
      (sfh.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      (CASE WHEN sfh.transaction_type = 'withdrawal'
            THEN -COALESCE(sfh.fund_amount, 0)
            ELSE  COALESCE(sfh.fund_amount, 0) END)::numeric
    FROM store_fund_history sfh
    WHERE sfh.store_id = p_store_id
      AND (sfh.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
  ),
  daily AS (
    SELECT event_date, SUM(delta)::numeric AS delta
    FROM events
    GROUP BY event_date
  ),
  cumulative AS (
    SELECT
      event_date,
      SUM(delta) OVER (ORDER BY event_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::numeric AS running_total
    FROM daily
  ),
  date_series AS (
    SELECT generate_series(p_start_date, p_end_date, interval '1 day')::date AS d
  )
  SELECT
    ds.d AS as_of_date,
    COALESCE(
      (SELECT c.running_total
       FROM cumulative c
       WHERE c.event_date <= ds.d
       ORDER BY c.event_date DESC
       LIMIT 1),
      0
    )::numeric AS fund_total
  FROM date_series ds
  ORDER BY ds.d;
$$;

GRANT EXECUTE ON FUNCTION public.calc_cash_fund_series(uuid, date, date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.calc_cash_fund_series IS
  'Event-sourced fund series: trả về fund_total tại cuối mỗi ngày trong range. Xử lý đúng giao dịch xoá muộn bằng pattern un-delete ngược thời gian.';
