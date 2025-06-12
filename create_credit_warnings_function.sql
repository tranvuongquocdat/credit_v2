-- Stored function để lấy tất cả credits với ngày thanh toán mới nhất trong một truy vấn
-- Sử dụng LEFT JOIN với DISTINCT ON để tối ưu performance

CREATE OR REPLACE FUNCTION get_credits_with_latest_payments(store_id UUID)
RETURNS TABLE (
  credit_id UUID,
  loan_date TIMESTAMP WITH TIME ZONE,
  loan_period INTEGER,
  interest_period INTEGER,
  latest_payment_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as credit_id,
    c.loan_date,
    c.loan_period,
    c.interest_period,
    lp.effective_date as latest_payment_date
  FROM credits c
  LEFT JOIN (
    SELECT DISTINCT ON (ch.credit_id) 
      ch.credit_id,
      ch.effective_date
    FROM credit_history ch
    WHERE ch.transaction_type = 'payment' 
      AND ch.is_deleted = false
    ORDER BY ch.credit_id, ch.effective_date DESC
  ) lp ON c.id = lp.credit_id
  WHERE c.status = 'on_time' 
    AND c.store_id = get_credits_with_latest_payments.store_id;
END;
$$ LANGUAGE plpgsql; 