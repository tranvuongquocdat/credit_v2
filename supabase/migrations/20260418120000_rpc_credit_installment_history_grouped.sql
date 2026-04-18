-- RPC báo cáo tổng hợp lịch sử tín chấp / trả góp (đã parity với scripts/test-rpc-queries.ts)

CREATE OR REPLACE FUNCTION rpc_credit_history_grouped(
  p_store_id   UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS TABLE (
  contract_code     TEXT,
  transaction_date DATE,
  transaction_type TEXT,
  is_deleted       BOOLEAN,
  credit_amount    NUMERIC,
  debit_amount     NUMERIC,
  cancel_date      TIMESTAMPTZ,
  customer_name    TEXT,
  employee_name    TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.contract_code,
    ch.created_at::date                            AS transaction_date,
    ch.transaction_type::TEXT,
    ch.is_deleted,
    COALESCE(SUM(ch.credit_amount), 0)::NUMERIC    AS credit_amount,
    COALESCE(SUM(ch.debit_amount), 0)::NUMERIC     AS debit_amount,
    MAX(ch.updated_at) FILTER (WHERE ch.is_deleted = true) AS cancel_date,
    cust.name,
    COALESCE(prof.username, '')                    AS employee_name
  FROM credit_history ch
  JOIN credits c ON ch.credit_id = c.id
  JOIN customers cust ON c.customer_id = cust.id
  LEFT JOIN profiles prof ON prof.id = ch.created_by
  WHERE (
      (ch.is_deleted = false AND ch.created_at BETWEEN p_start_date AND p_end_date)
      OR
      (ch.is_deleted = true  AND ch.transaction_type = 'payment'
       AND ch.updated_at BETWEEN p_start_date AND p_end_date)
    )
    AND c.store_id = p_store_id
  GROUP BY
    c.contract_code,
    ch.created_at::date,
    ch.transaction_type,
    ch.is_deleted,
    cust.name,
    prof.username
  ORDER BY
    transaction_date DESC,
    contract_code;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_installment_history_grouped(
  p_store_id   UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS TABLE (
  contract_code     TEXT,
  transaction_date DATE,
  transaction_type TEXT,
  is_deleted       BOOLEAN,
  credit_amount    NUMERIC,
  debit_amount     NUMERIC,
  cancel_date      TIMESTAMPTZ,
  customer_name    TEXT,
  employee_name    TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.contract_code,
    ih.created_at::date                            AS txn_date,
    ih.transaction_type::TEXT,
    ih.is_deleted,
    COALESCE(SUM(ih.credit_amount), 0)::NUMERIC,
    COALESCE(SUM(ih.debit_amount), 0)::NUMERIC,
    MAX(ih.updated_at) FILTER (WHERE ih.is_deleted = true) AS cancel_date,
    cust.name,
    COALESCE(prof.username, '')
  FROM installment_history ih
  JOIN installments i ON ih.installment_id = i.id
  JOIN customers cust ON i.customer_id = cust.id
  LEFT JOIN profiles prof ON prof.id = ih.created_by
  WHERE (
      (ih.is_deleted = false AND ih.created_at BETWEEN p_start_date AND p_end_date)
      OR
      (ih.is_deleted = true  AND ih.transaction_type = 'payment'
       AND ih.updated_at BETWEEN p_start_date AND p_end_date)
    )
    AND i.employee_id IN (
      SELECT id FROM employees WHERE store_id = p_store_id
    )
    AND ih.transaction_type NOT IN ('contract_close', 'contract_rotate')
  GROUP BY
    i.contract_code,
    ih.created_at::date,
    ih.transaction_type,
    ih.is_deleted,
    cust.name,
    prof.username
  ORDER BY
    txn_date DESC,
    contract_code;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_pawn_history_grouped(
  p_store_id   UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS TABLE (
  contract_code      TEXT,
  transaction_date   DATE,
  transaction_type   TEXT,
  is_deleted         BOOLEAN,
  credit_amount      NUMERIC,
  debit_amount       NUMERIC,
  cancel_date        TIMESTAMPTZ,
  customer_name      TEXT,
  employee_name      TEXT,
  item_name          TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.contract_code,
    ph.created_at::date                            AS transaction_date,
    ph.transaction_type::TEXT,
    ph.is_deleted,
    COALESCE(SUM(ph.credit_amount), 0)::NUMERIC,
    COALESCE(SUM(ph.debit_amount), 0)::NUMERIC,
    MAX(ph.updated_at) FILTER (WHERE ph.is_deleted = true) AS cancel_date,
    cust.name,
    COALESCE(prof.username, ''),
    COALESCE(
      NULLIF(p.collateral_detail::jsonb ->> 'name', ''),
      col.name,
      ''
    )::TEXT
  FROM pawn_history ph
  JOIN pawns p ON ph.pawn_id = p.id
  JOIN customers cust ON p.customer_id = cust.id
  LEFT JOIN profiles prof ON prof.id = ph.created_by
  LEFT JOIN collaterals col ON p.collateral_id = col.id
  WHERE (
      (ph.created_at BETWEEN p_start_date AND p_end_date)
      OR
      (
        ph.transaction_type = 'payment'
        AND ph.is_deleted = true
        AND ph.updated_at BETWEEN p_start_date AND p_end_date
      )
    )
    AND p.store_id = p_store_id
  GROUP BY
    p.contract_code,
    ph.created_at::date,
    ph.transaction_type,
    ph.is_deleted,
    cust.name,
    prof.username,
    COALESCE(
      NULLIF(p.collateral_detail::jsonb ->> 'name', ''),
      col.name,
      ''
    )
  ORDER BY
    transaction_date DESC,
    contract_code;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_store_fund_history_grouped(
  p_store_id   UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS TABLE (
  transaction_date   DATE,
  transaction_type   TEXT,
  fund_amount        NUMERIC,
  customer_name      TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sfh.created_at::date                            AS transaction_date,
    sfh.transaction_type::TEXT,
    COALESCE(SUM(sfh.fund_amount), 0)::NUMERIC      AS fund_amount,
    COALESCE(sfh.name, '')::TEXT                    AS customer_name
  FROM store_fund_history sfh
  WHERE sfh.store_id = p_store_id
    AND sfh.created_at BETWEEN p_start_date AND p_end_date
  GROUP BY
    sfh.created_at::date,
    sfh.transaction_type,
    COALESCE(sfh.name, '')
  ORDER BY
    transaction_date DESC;
END;
$$;
