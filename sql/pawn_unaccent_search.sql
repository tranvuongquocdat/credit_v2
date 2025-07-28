-- Enable unaccent extension for Vietnamese diacritic removal
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS search_pawns_unaccent;

-- RPC function using the existing pawns_by_store view
CREATE OR REPLACE FUNCTION search_pawns_unaccent(
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
  loan_amount NUMERIC,
  debt_amount NUMERIC,
  loan_date TIMESTAMP WITH TIME ZONE,
  loan_period INTEGER,
  interest_type TEXT,
  interest_value NUMERIC,
  interest_period INTEGER,
  interest_notation TEXT,
  interest_ui_type TEXT,
  status pawn_status,
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
    p.id,
    p.customer_id,
    p.contract_code,
    p.loan_amount,
    p.debt_amount,
    p.loan_date,
    p.loan_period,
    p.interest_type::TEXT,
    p.interest_value,
    p.interest_period,
    p.interest_notation,
    p.interest_ui_type,
    p.status,
    p.has_paid,
    p.is_completed,
    p.notes,
    p.created_at,
    p.updated_at,
    p.store_id,
    p.status_code::TEXT,
    p.next_payment_date,
    cust.name as customer_name,
    cust.phone as customer_phone,
    cust.address as customer_address,
    cust.id_number as customer_id_number
  FROM pawns_by_store p
  JOIN customers cust ON p.customer_id = cust.id
  WHERE 
    -- Vietnamese unaccented search for customer name
    (p_customer_name = '' OR 
     cust.name ILIKE '%' || p_customer_name || '%' OR
     unaccent(cust.name) ILIKE unaccent('%' || p_customer_name || '%'))
    AND (p_contract_code = '' OR p.contract_code ILIKE '%' || p_contract_code || '%')
    AND (p_start_date IS NULL OR p.loan_date::DATE >= p_start_date)
    AND (p_end_date IS NULL OR p.loan_date::DATE <= p_end_date)
    AND (p_duration IS NULL OR p.loan_period = p_duration)
    AND (p_store_id IS NULL OR p.store_id = p_store_id)
    AND (p_status IS NULL OR 
         CASE 
           -- Handle ON_TIME special case (includes OVERDUE and LATE_INTEREST)
           WHEN p_status = 'on_time' THEN p.status_code IN ('ON_TIME', 'OVERDUE', 'LATE_INTEREST')
           -- Handle individual status mapping
           WHEN p_status = 'overdue' THEN p.status_code = 'OVERDUE'
           WHEN p_status = 'late_interest' THEN p.status_code = 'LATE_INTEREST'
           WHEN p_status = 'closed' THEN p.status_code = 'CLOSED'
           WHEN p_status = 'deleted' THEN p.status_code = 'DELETED'
           WHEN p_status = 'bad_debt' THEN p.status_code = 'BAD_DEBT'
           WHEN p_status = 'finished' THEN p.status_code = 'FINISHED'
           WHEN p_status = 'due_tomorrow' THEN p.next_payment_date = (CURRENT_DATE + INTERVAL '1 day')
           -- All other statuses match exactly
           ELSE p.status_code = p_status
         END)
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;