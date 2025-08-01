-- Enable unaccent extension for Vietnamese diacritic removal
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS search_credits_unaccent;

-- RPC function using the existing credits_by_store view
CREATE OR REPLACE FUNCTION search_credits_unaccent(
  p_customer_name TEXT DEFAULT '',
  p_contract_code TEXT DEFAULT '',
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_duration INTEGER DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  customer_id UUID,
  contract_code TEXT,
  collateral TEXT,
  loan_amount NUMERIC,
  debt_amount NUMERIC,
  loan_date TIMESTAMP WITH TIME ZONE,
  loan_period INTEGER,
  interest_type TEXT,
  interest_value NUMERIC,
  interest_period INTEGER,
  interest_notation TEXT,
  interest_ui_type TEXT,
  status credit_status,
  has_paid BOOLEAN,
  is_completed BOOLEAN,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  store_id UUID,
  status_code TEXT,
  next_payment_date DATE,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_id_number TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.customer_id,
    c.contract_code,
    c.collateral,
    c.loan_amount,
    c.debt_amount,
    c.loan_date,
    c.loan_period,
    c.interest_type::TEXT,
    c.interest_value,
    c.interest_period,
    c.interest_notation,
    c.interest_ui_type,
    c.status,
    c.has_paid,
    c.is_completed,
    c.notes,
    c.created_at,
    c.updated_at,
    c.store_id,
    c.status_code::TEXT,
    c.next_payment_date,
    cust.name as customer_name,
    cust.phone as customer_phone,
    cust.address as customer_address,
    cust.id_number as customer_id_number
  FROM credits_by_store c
  JOIN customers cust ON c.customer_id = cust.id
  WHERE 
    -- Vietnamese unaccented search for customer name
    (p_customer_name = '' OR 
     cust.name ILIKE '%' || p_customer_name || '%' OR
     unaccent(cust.name) ILIKE unaccent('%' || p_customer_name || '%'))
    AND (p_contract_code = '' OR c.contract_code ILIKE '%' || p_contract_code || '%')
    AND (p_start_date IS NULL OR c.loan_date::DATE >= p_start_date)
    AND (p_end_date IS NULL OR c.loan_date::DATE <= p_end_date)
    AND (p_duration IS NULL OR c.loan_period = p_duration)
    AND (p_store_id IS NULL OR c.store_id = p_store_id)
    AND (p_status IS NULL OR 
         CASE 
           -- Handle ON_TIME special case (includes OVERDUE and LATE_INTEREST)
           WHEN p_status = 'on_time' THEN c.status_code IN ('ON_TIME', 'OVERDUE', 'LATE_INTEREST')
           -- Handle individual status mapping
           WHEN p_status = 'overdue' THEN c.status_code = 'OVERDUE'
           WHEN p_status = 'late_interest' THEN c.status_code = 'LATE_INTEREST'
           WHEN p_status = 'closed' THEN c.status_code = 'CLOSED'
           WHEN p_status = 'deleted' THEN c.status_code = 'DELETED'
           WHEN p_status = 'bad_debt' THEN c.status_code = 'BAD_DEBT'
           WHEN p_status = 'finished' THEN c.status_code = 'FINISHED'
           WHEN p_status = 'due_tomorrow' THEN c.next_payment_date = (CURRENT_DATE + INTERVAL '1 day')
           -- All other statuses match exactly
           ELSE c.status_code = p_status
         END)
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;