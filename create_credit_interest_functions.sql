-- Stored function để tính tổng lãi phí đã thu của một hợp đồng tín dụng
CREATE OR REPLACE FUNCTION sum_credit_interest(
  p_credit_id UUID,
  p_start_date TIMESTAMP WITH TIME ZONE,
  p_end_date TIMESTAMP WITH TIME ZONE
)
RETURNS NUMERIC AS $$
DECLARE
  total_interest NUMERIC;
BEGIN
  SELECT COALESCE(SUM(credit_amount), 0)
  INTO total_interest
  FROM credit_history
  WHERE credit_id = p_credit_id
    AND is_deleted = false
    AND transaction_type = 'payment'
    AND created_at >= p_start_date
    AND created_at <= p_end_date;
    
  RETURN total_interest;
END;
$$ LANGUAGE plpgsql;

-- Stored function để tính tổng lãi phí đã thu của nhiều hợp đồng tín dụng
CREATE OR REPLACE FUNCTION sum_credit_interest_multiple(
  p_credit_ids UUID[],
  p_start_date TIMESTAMP WITH TIME ZONE,
  p_end_date TIMESTAMP WITH TIME ZONE
)
RETURNS NUMERIC AS $$
DECLARE
  total_interest NUMERIC;
BEGIN
  SELECT COALESCE(SUM(credit_amount), 0)
  INTO total_interest
  FROM credit_history
  WHERE credit_id = ANY(p_credit_ids)
    AND is_deleted = false
    AND transaction_type = 'payment'
    AND created_at >= p_start_date
    AND created_at <= p_end_date;
    
  RETURN total_interest;
END;
$$ LANGUAGE plpgsql; 