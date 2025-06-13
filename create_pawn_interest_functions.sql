-- Stored function để tính tổng lãi phí đã thu của một hợp đồng cầm đồ
CREATE OR REPLACE FUNCTION sum_pawn_interest(
  p_pawn_id UUID,
  p_start_date TIMESTAMP WITH TIME ZONE,
  p_end_date TIMESTAMP WITH TIME ZONE
)
RETURNS NUMERIC AS $$
DECLARE
  total_interest NUMERIC;
BEGIN
  SELECT COALESCE(SUM(credit_amount), 0)
  INTO total_interest
  FROM pawn_history
  WHERE pawn_id = p_pawn_id
    AND is_deleted = false
    AND transaction_type = 'payment'
    AND created_at >= p_start_date
    AND created_at <= p_end_date;
    
  RETURN total_interest;
END;
$$ LANGUAGE plpgsql;

-- Stored function để tính tổng lãi phí đã thu của nhiều hợp đồng cầm đồ
CREATE OR REPLACE FUNCTION sum_pawn_interest_multiple(
  p_pawn_ids UUID[],
  p_start_date TIMESTAMP WITH TIME ZONE,
  p_end_date TIMESTAMP WITH TIME ZONE
)
RETURNS NUMERIC AS $$
DECLARE
  total_interest NUMERIC;
BEGIN
  SELECT COALESCE(SUM(credit_amount), 0)
  INTO total_interest
  FROM pawn_history
  WHERE pawn_id = ANY(p_pawn_ids)
    AND is_deleted = false
    AND transaction_type = 'payment'
    AND created_at >= p_start_date
    AND created_at <= p_end_date;
    
  RETURN total_interest;
END;
$$ LANGUAGE plpgsql; 