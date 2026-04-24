-- RPC: tính fund của 1 store tại thời điểm p_as_of cụ thể.
-- Event-sourced: derive từ history tables, không đọc stores.cash_fund.
-- Khi p_as_of = NULL → tính tại thời điểm hiện tại (NOW()).
--
-- Xử lý đúng giao dịch xoá muộn: row is_deleted=true với updated_at > p_as_of
-- vẫn coi như active tại p_as_of (un-delete ngược thời gian).

DROP FUNCTION IF EXISTS public.calc_cash_fund_as_of(uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.calc_cash_fund_as_of(
  p_store_id uuid,
  p_as_of    timestamptz DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT COALESCE(p_as_of, NOW()) AS as_of
  ),
  credit_total AS (
    SELECT COALESCE(SUM(COALESCE(ch.credit_amount, 0) - COALESCE(ch.debit_amount, 0)), 0)::numeric AS total
    FROM credit_history ch
    JOIN credits c ON c.id = ch.credit_id
    CROSS JOIN bounds
    WHERE c.store_id = p_store_id
      AND ch.created_at <= bounds.as_of
      AND (ch.is_deleted = false OR ch.updated_at > bounds.as_of)
  ),
  pawn_total AS (
    SELECT COALESCE(SUM(COALESCE(ph.credit_amount, 0) - COALESCE(ph.debit_amount, 0)), 0)::numeric AS total
    FROM pawn_history ph
    JOIN pawns p ON p.id = ph.pawn_id
    CROSS JOIN bounds
    WHERE p.store_id = p_store_id
      AND ph.created_at <= bounds.as_of
      AND (ph.is_deleted = false OR ph.updated_at > bounds.as_of)
  ),
  installment_total AS (
    SELECT COALESCE(SUM(COALESCE(ih.credit_amount, 0) - COALESCE(ih.debit_amount, 0)), 0)::numeric AS total
    FROM installment_history ih
    JOIN installments i ON i.id = ih.installment_id
    JOIN employees    e ON e.id = i.employee_id
    CROSS JOIN bounds
    WHERE e.store_id = p_store_id
      AND ih.created_at <= bounds.as_of
      AND (ih.is_deleted = false OR ih.updated_at > bounds.as_of)
  ),
  transaction_total AS (
    SELECT COALESCE(SUM(COALESCE(t.credit_amount, 0) - COALESCE(t.debit_amount, 0)), 0)::numeric AS total
    FROM transactions t
    CROSS JOIN bounds
    WHERE t.store_id = p_store_id
      AND t.created_at <= bounds.as_of
      AND (t.is_deleted = false OR t.update_at > bounds.as_of)
  ),
  fund_total AS (
    SELECT COALESCE(SUM(
             CASE WHEN sfh.transaction_type = 'withdrawal'
                  THEN -COALESCE(sfh.fund_amount, 0)
                  ELSE  COALESCE(sfh.fund_amount, 0) END
           ), 0)::numeric AS total
    FROM store_fund_history sfh
    CROSS JOIN bounds
    WHERE sfh.store_id = p_store_id
      AND sfh.created_at <= bounds.as_of
  )
  SELECT (credit_total.total + pawn_total.total + installment_total.total
          + transaction_total.total + fund_total.total)::numeric
  FROM credit_total, pawn_total, installment_total, transaction_total, fund_total;
$$;

GRANT EXECUTE ON FUNCTION public.calc_cash_fund_as_of(uuid, timestamptz)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.calc_cash_fund_as_of IS
  'Event-sourced fund at a specific timestamp. p_as_of NULL = now. Xử lý đúng giao dịch xoá muộn qua điều kiện updated_at > as_of.';
