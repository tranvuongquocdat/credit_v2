-- RPC: dữ liệu full cho báo cáo dòng tiền theo ngày
-- Trả về mỗi ngày: activity của 5 nguồn + fund_total (closing balance).
-- Opening balance của ngày D = fund_total của ngày (D-1).
--
-- Event model: mỗi history row tạo +/- event, GROUP BY (source, event_date).
-- Xử lý đúng giao dịch xoá muộn bằng pattern un-delete ngược thời gian.

DROP FUNCTION IF EXISTS public.rpc_money_by_day_series(uuid, date, date);

CREATE OR REPLACE FUNCTION public.rpc_money_by_day_series(
  p_store_id   uuid,
  p_start_date date,
  p_end_date   date
)
RETURNS TABLE (
  as_of_date           date,
  pawn_activity        numeric,
  credit_activity      numeric,
  installment_activity numeric,
  transaction_activity numeric,
  fund_activity        numeric,
  fund_total           numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH events AS (
    -- credit_history: +delta at created_at_date
    SELECT
      'credit'::text AS source,
      (ch.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS event_date,
      (COALESCE(ch.credit_amount, 0) - COALESCE(ch.debit_amount, 0))::numeric AS delta
    FROM credit_history ch
    JOIN credits c ON c.id = ch.credit_id
    WHERE c.store_id = p_store_id
      AND (ch.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date

    UNION ALL
    -- credit_history: -delta at updated_at_date (nếu xoá)
    SELECT
      'credit',
      (ch.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      -(COALESCE(ch.credit_amount, 0) - COALESCE(ch.debit_amount, 0))::numeric
    FROM credit_history ch
    JOIN credits c ON c.id = ch.credit_id
    WHERE c.store_id = p_store_id
      AND ch.is_deleted = true
      AND (ch.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date

    UNION ALL
    -- pawn_history: +delta
    SELECT
      'pawn',
      (ph.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      (COALESCE(ph.credit_amount, 0) - COALESCE(ph.debit_amount, 0))::numeric
    FROM pawn_history ph
    JOIN pawns p ON p.id = ph.pawn_id
    WHERE p.store_id = p_store_id
      AND (ph.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date

    UNION ALL
    -- pawn_history: -delta nếu xoá
    SELECT
      'pawn',
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
      'installment',
      (ih.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      (COALESCE(ih.credit_amount, 0) - COALESCE(ih.debit_amount, 0))::numeric
    FROM installment_history ih
    JOIN installments i ON i.id = ih.installment_id
    JOIN employees    e ON e.id = i.employee_id
    WHERE e.store_id = p_store_id
      AND (ih.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date

    UNION ALL
    -- installment_history: -delta nếu xoá
    SELECT
      'installment',
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
      'transaction',
      (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      (COALESCE(t.credit_amount, 0) - COALESCE(t.debit_amount, 0))::numeric
    FROM transactions t
    WHERE t.store_id = p_store_id
      AND (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date

    UNION ALL
    -- transactions: -delta nếu xoá (cột update_at, không phải updated_at)
    SELECT
      'transaction',
      (t.update_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      -(COALESCE(t.credit_amount, 0) - COALESCE(t.debit_amount, 0))::numeric
    FROM transactions t
    WHERE t.store_id = p_store_id
      AND t.is_deleted = true
      AND (t.update_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date

    UNION ALL
    -- store_fund_history: nạp/rút vốn
    SELECT
      'fund',
      (sfh.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      (CASE WHEN sfh.transaction_type = 'withdrawal'
            THEN -COALESCE(sfh.fund_amount, 0)
            ELSE  COALESCE(sfh.fund_amount, 0) END)::numeric
    FROM store_fund_history sfh
    WHERE sfh.store_id = p_store_id
      AND (sfh.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
  ),
  daily_by_source AS (
    SELECT source, event_date, SUM(delta)::numeric AS delta
    FROM events
    GROUP BY source, event_date
  ),
  daily_pivot AS (
    SELECT
      event_date,
      COALESCE(SUM(delta) FILTER (WHERE source = 'pawn'), 0)::numeric        AS pawn_activity,
      COALESCE(SUM(delta) FILTER (WHERE source = 'credit'), 0)::numeric      AS credit_activity,
      COALESCE(SUM(delta) FILTER (WHERE source = 'installment'), 0)::numeric AS installment_activity,
      COALESCE(SUM(delta) FILTER (WHERE source = 'transaction'), 0)::numeric AS transaction_activity,
      COALESCE(SUM(delta) FILTER (WHERE source = 'fund'), 0)::numeric        AS fund_activity,
      COALESCE(SUM(delta), 0)::numeric                                        AS total_delta
    FROM daily_by_source
    GROUP BY event_date
  ),
  cumulative AS (
    SELECT
      event_date,
      pawn_activity,
      credit_activity,
      installment_activity,
      transaction_activity,
      fund_activity,
      SUM(total_delta) OVER (ORDER BY event_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::numeric AS running_total
    FROM daily_pivot
  ),
  date_series AS (
    -- Sinh từ p_start_date - 1 để có opening balance cho ngày đầu
    SELECT generate_series(
      p_start_date - interval '1 day',
      p_end_date,
      interval '1 day'
    )::date AS d
  )
  SELECT
    ds.d AS as_of_date,
    COALESCE(dp.pawn_activity, 0)::numeric        AS pawn_activity,
    COALESCE(dp.credit_activity, 0)::numeric      AS credit_activity,
    COALESCE(dp.installment_activity, 0)::numeric AS installment_activity,
    COALESCE(dp.transaction_activity, 0)::numeric AS transaction_activity,
    COALESCE(dp.fund_activity, 0)::numeric        AS fund_activity,
    COALESCE(
      (SELECT c.running_total
       FROM cumulative c
       WHERE c.event_date <= ds.d
       ORDER BY c.event_date DESC
       LIMIT 1),
      0
    )::numeric AS fund_total
  FROM date_series ds
  LEFT JOIN daily_pivot dp ON dp.event_date = ds.d
  ORDER BY ds.d;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_money_by_day_series(uuid, date, date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_money_by_day_series IS
  'Event-sourced money-by-day: trả về activity per source + fund_total cho mỗi ngày trong [start-1, end]. Hàng đầu tiên (start-1) dùng làm opening balance cho ngày start.';
