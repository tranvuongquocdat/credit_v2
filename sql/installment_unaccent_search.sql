-- Enable unaccent extension for Vietnamese diacritic removal
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS search_installments_unaccent;

-- Simple RPC function using the existing installments_by_store view
CREATE OR REPLACE FUNCTION search_installments_unaccent(
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
  employee_id UUID,
  contract_code TEXT,
  installment_amount NUMERIC,
  down_payment NUMERIC,
  loan_date TIMESTAMP WITH TIME ZONE,
  loan_period INTEGER,
  payment_period INTEGER,
  status installment_status,
  document TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  store_id UUID,
  status_code TEXT,
  payment_due_date TIMESTAMP WITH TIME ZONE,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_id_number TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.customer_id,
    i.employee_id,
    i.contract_code,
    i.installment_amount,
    i.down_payment,
    i.loan_date,
    i.loan_period,
    i.payment_period,
    i.status,
    i.document,
    i.notes,
    i.created_at,
    i.updated_at,
    i.store_id,
    i.status_code::TEXT,
    i.payment_due_date,
    c.name as customer_name,
    c.phone as customer_phone,
    c.address as customer_address,
    c.id_number as customer_id_number
  FROM installments_by_store i
  JOIN customers c ON i.customer_id = c.id
  WHERE 
    -- Vietnamese unaccented search for customer name
    (p_customer_name = '' OR 
     c.name ILIKE '%' || p_customer_name || '%' OR
     unaccent(c.name) ILIKE unaccent('%' || p_customer_name || '%'))
    AND (p_contract_code = '' OR i.contract_code ILIKE '%' || p_contract_code || '%')
    AND (p_start_date IS NULL OR i.loan_date::DATE >= p_start_date)
    AND (p_end_date IS NULL OR i.loan_date::DATE <= p_end_date)
    AND (p_duration IS NULL OR i.loan_period = p_duration)
    AND (p_store_id IS NULL OR i.store_id = p_store_id)
    AND (p_status IS NULL OR 
         CASE 
           -- Handle ON_TIME special case (includes OVERDUE and LATE_INTEREST)
           WHEN p_status = 'ON_TIME' THEN i.status_code IN ('ON_TIME', 'OVERDUE', 'LATE_INTEREST')
           -- All other statuses match exactly
           ELSE i.status_code = p_status
         END)
  ORDER BY i.created_at DESC, i.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;