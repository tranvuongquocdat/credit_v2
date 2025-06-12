-- Stored function để lấy tất cả pawns với ngày thanh toán mới nhất trong một truy vấn
-- Sử dụng LEFT JOIN với DISTINCT ON để tối ưu performance

CREATE OR REPLACE FUNCTION get_pawns_with_latest_payments(store_id UUID)
RETURNS TABLE (
  pawn_id UUID,
  loan_date TIMESTAMP WITH TIME ZONE,
  loan_period INTEGER,
  interest_period INTEGER,
  latest_payment_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as pawn_id,
    p.loan_date,
    p.loan_period,
    p.interest_period,
    lp.effective_date as latest_payment_date
  FROM pawns p
  LEFT JOIN (
    SELECT DISTINCT ON (ph.pawn_id) 
      ph.pawn_id,
      ph.effective_date
    FROM pawn_history ph
    WHERE ph.transaction_type = 'payment' 
      AND ph.is_deleted = false
    ORDER BY ph.pawn_id, ph.effective_date DESC
  ) lp ON p.id = lp.pawn_id
  WHERE p.status = 'on_time'
    AND p.store_id = get_pawns_with_latest_payments.store_id;
END;
$$ LANGUAGE plpgsql; 