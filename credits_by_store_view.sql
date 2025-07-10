-- Create credits_by_store view with pre-calculated status_code
-- This view mirrors the logic from get_credit_statuses RPC function

CREATE OR REPLACE VIEW credits_by_store AS
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
    
    -- 3. Finished status check (paid until contract end)
    WHEN lp.latest_payment_date IS NOT NULL 
         AND lp.latest_payment_date = (c.loan_date::date + (c.loan_period - 1) * INTERVAL '1 day')::date THEN
      'FINISHED'
    
    -- 4. Late interest check
    WHEN (
      COALESCE(lp.latest_payment_date, c.loan_date::date) 
      + (COALESCE(c.interest_period, 30) * INTERVAL '1 day')
    )::date <= CURRENT_DATE THEN
      'LATE_INTEREST'
    
    -- 5. Default: On time
    ELSE 'ON_TIME'
  END AS status_code,

  -- Calculate next_payment_date based on get_next_payment_info RPC logic
  CASE
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

-- Add comment explaining the view
COMMENT ON VIEW credits_by_store IS 'Enhanced view with pre-calculated status_code and next_payment_date for credits, mirroring get_credit_statuses and get_next_payment_info RPC logic for efficient filtering';