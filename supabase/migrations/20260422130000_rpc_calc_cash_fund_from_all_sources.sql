-- RPC read-only: tính lại cash_fund của 1 store từ 5 nguồn history.
-- KHÔNG update bất kỳ bảng nào (update ở TS cho dễ debug).
-- Thay thế vòng loop client-side trong src/lib/store.ts updateCashFundFromAllSources.

DROP FUNCTION IF EXISTS public.calc_cash_fund_from_all_sources(uuid);

CREATE OR REPLACE FUNCTION public.calc_cash_fund_from_all_sources(
  p_store_id uuid
)
RETURNS TABLE (
  credit_total      numeric,
  pawn_total        numeric,
  installment_total numeric,
  fund_total        numeric,
  transaction_total numeric,
  grand_total       numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  credit AS (
    SELECT COALESCE(SUM(ch.credit_amount - ch.debit_amount), 0)::numeric AS total
    FROM credit_history ch
    JOIN credits c ON c.id = ch.credit_id
    WHERE c.store_id = p_store_id
      AND ch.is_deleted = false
  ),
  pawn AS (
    SELECT COALESCE(SUM(ph.credit_amount - ph.debit_amount), 0)::numeric AS total
    FROM pawn_history ph
    JOIN pawns p ON p.id = ph.pawn_id
    WHERE p.store_id = p_store_id
      AND ph.is_deleted = false
  ),
  installment AS (
    SELECT COALESCE(SUM(ih.credit_amount - ih.debit_amount), 0)::numeric AS total
    FROM installment_history ih
    JOIN installments i ON i.id = ih.installment_id
    JOIN employees    e ON e.id = i.employee_id
    WHERE e.store_id = p_store_id
      AND ih.is_deleted = false
  ),
  fund AS (
    SELECT COALESCE(SUM(
             CASE WHEN sfh.transaction_type = 'withdrawal'
                  THEN -sfh.fund_amount
                  ELSE  sfh.fund_amount END
           ), 0)::numeric AS total
    FROM store_fund_history sfh
    WHERE sfh.store_id = p_store_id
  ),
  trans AS (
    SELECT COALESCE(SUM(t.credit_amount - t.debit_amount), 0)::numeric AS total
    FROM transactions t
    WHERE t.store_id = p_store_id
      AND t.is_deleted = false
  )
  SELECT
    credit.total       AS credit_total,
    pawn.total         AS pawn_total,
    installment.total  AS installment_total,
    fund.total         AS fund_total,
    trans.total        AS transaction_total,
    (credit.total + pawn.total + installment.total + fund.total + trans.total)
                       AS grand_total
  FROM credit, pawn, installment, fund, trans;
$$;

GRANT EXECUTE ON FUNCTION public.calc_cash_fund_from_all_sources(uuid)
  TO authenticated, service_role;
