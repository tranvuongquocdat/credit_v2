-- Create trigger for credit_amount_history to automatically insert records into credit_history
-- based on the amount value (positive or negative)
CREATE OR REPLACE FUNCTION process_credit_amount_history_insert()
RETURNS TRIGGER AS $$
DECLARE
  transaction_type credit_transaction_type;
  description_text TEXT;
BEGIN
  -- Determine transaction type and description based on amount
  IF NEW.amount > 0 THEN
    transaction_type := 'additional_loan';
    description_text := COALESCE(NEW.note, 'Vay thêm');
  ELSE
    transaction_type := 'principal_repayment';
    description_text := COALESCE(NEW.note, 'Trả bớt gốc');
  END IF;
  
  -- Insert into credit_history
  INSERT INTO credit_history (
    credit_id,
    transaction_type,
    debit_amount,
    credit_amount,
    description,
    employee_id,
    created_at
  ) VALUES (
    NEW.credit_id,
    transaction_type,
    CASE WHEN transaction_type = 'additional_loan' THEN NEW.amount ELSE 0 END,
    CASE WHEN transaction_type = 'principal_repayment' THEN ABS(NEW.amount) ELSE 0 END,
    description_text,
    NULL, -- Could be linked to session user if needed
    NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle deletion of credit_amount_history records
CREATE OR REPLACE FUNCTION process_credit_amount_history_delete()
RETURNS TRIGGER AS $$
DECLARE
  transaction_type credit_transaction_type;
  description_text TEXT;
BEGIN
  -- Determine transaction type and description based on amount (reverse of insert)
  IF OLD.amount > 0 THEN
    transaction_type := 'cancel_additional_loan';
    description_text := COALESCE(OLD.note, 'Hủy vay thêm');
  ELSE
    transaction_type := 'cancel_principal_repayment';
    description_text := COALESCE(OLD.note, 'Hủy trả bớt gốc');
  END IF;
  
  -- Insert into credit_history
  INSERT INTO credit_history (
    credit_id,
    transaction_type,
    debit_amount,
    credit_amount,
    description,
    employee_id,
    created_at
  ) VALUES (
    OLD.credit_id,
    transaction_type,
    CASE WHEN transaction_type = 'cancel_principal_repayment' THEN ABS(OLD.amount) ELSE 0 END,
    CASE WHEN transaction_type = 'cancel_additional_loan' THEN OLD.amount ELSE 0 END,
    description_text,
    NULL, -- Could be linked to session user if needed
    NOW()
  );
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;


-- Create the triggers
CREATE TRIGGER trigger_credit_amount_history_insert
  AFTER INSERT ON credit_amount_history
  FOR EACH ROW
  EXECUTE FUNCTION process_credit_amount_history_insert();

CREATE TRIGGER trigger_credit_amount_history_delete
  AFTER DELETE ON credit_amount_history
  FOR EACH ROW
  EXECUTE FUNCTION process_credit_amount_history_delete();

-- Add comments for documentation
COMMENT ON FUNCTION process_credit_amount_history_insert() IS 'Automatically inserts records into credit_history when new credit_amount_history records are created, handling both positive (additional loan) and negative (principal repayment) amounts';
COMMENT ON FUNCTION process_credit_amount_history_delete() IS 'Automatically inserts reversal records into credit_history when credit_amount_history records are deleted'; 