-- Create trigger function to log installment payment period deletions
CREATE OR REPLACE FUNCTION log_installment_payment_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if the period was actually paid (had actual_amount > 0)
  IF OLD.actual_amount > 0 THEN
    INSERT INTO installment_histories (
      installment_id,
      transaction_type,
      debit_amount,
      credit_amount,
      description,
      employee_id,
      created_at
    ) VALUES (
      OLD.installment_id,
      'payment_reversal',
      OLD.actual_amount,  -- debit_amount = money going out (reversal)
      0,                  -- credit_amount = 0 for reversals
      'Hủy thanh toán kỳ ' || OLD.period_number || ' - Số tiền: ' || OLD.actual_amount,
      NULL,               -- Could be linked to session user if needed
      NOW()
    );
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on installment_payment_period table
DROP TRIGGER IF EXISTS installment_payment_deletion_trigger ON installment_payment_period;
CREATE TRIGGER installment_payment_deletion_trigger
  BEFORE DELETE ON installment_payment_period
  FOR EACH ROW
  EXECUTE FUNCTION log_installment_payment_deletion(); 