-- Create trigger for pawn_amount_history to automatically insert records into pawn_history
-- based on the amount value (positive or negative)

CREATE OR REPLACE FUNCTION process_pawn_amount_history_insert()
RETURNS TRIGGER AS $$
DECLARE
  transaction_type pawn_transaction_type;
  notes_text TEXT;
BEGIN
  -- Determine transaction type and notes based on amount
  IF NEW.amount > 0 THEN
    transaction_type := 'new_loan';
    notes_text := COALESCE(NEW.note, 'Vay thêm');
  ELSE
    transaction_type := 'principal_repayment';
    notes_text := COALESCE(NEW.note, 'Trả bớt gốc');
  END IF;
  
  -- Insert into pawn_history
  INSERT INTO pawn_history (
    pawn_id,
    transaction_type,
    debit_amount,
    credit_amount,
    transaction_date,
    notes,
    created_at,
    updated_at
  ) VALUES (
    NEW.pawn_id,
    transaction_type,
    CASE WHEN transaction_type = 'new_loan' THEN NEW.amount ELSE 0 END,
    CASE WHEN transaction_type = 'principal_repayment' THEN ABS(NEW.amount) ELSE 0 END,
    NOW(),
    notes_text,
    NOW(),
    NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle deletion of pawn_amount_history records
CREATE OR REPLACE FUNCTION process_pawn_amount_history_delete()
RETURNS TRIGGER AS $$
DECLARE
  transaction_type pawn_transaction_type;
  notes_text TEXT;
BEGIN
  -- Determine transaction type and notes based on amount (reverse of insert)
  IF OLD.amount > 0 THEN
    transaction_type := 'other';
    notes_text := COALESCE(OLD.note, 'Hủy vay thêm');
  ELSE
    transaction_type := 'other';
    notes_text := COALESCE(OLD.note, 'Hủy trả bớt gốc');
  END IF;
  
  -- Insert into pawn_history
  INSERT INTO pawn_history (
    pawn_id,
    transaction_type,
    debit_amount,
    credit_amount,
    transaction_date,
    notes,
    created_at,
    updated_at
  ) VALUES (
    OLD.pawn_id,
    transaction_type,
    CASE WHEN OLD.amount < 0 THEN ABS(OLD.amount) ELSE 0 END,
    CASE WHEN OLD.amount > 0 THEN OLD.amount ELSE 0 END,
    NOW(),
    notes_text,
    NOW(),
    NOW()
  );
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create the triggers
CREATE TRIGGER trigger_pawn_amount_history_insert
  AFTER INSERT ON pawn_amount_history
  FOR EACH ROW
  EXECUTE FUNCTION process_pawn_amount_history_insert();

CREATE TRIGGER trigger_pawn_amount_history_delete
  AFTER DELETE ON pawn_amount_history
  FOR EACH ROW
  EXECUTE FUNCTION process_pawn_amount_history_delete();

-- Add comments for documentation
COMMENT ON FUNCTION process_pawn_amount_history_insert() IS 'Automatically inserts records into pawn_history when new pawn_amount_history records are created, handling both positive (additional loan) and negative (principal repayment) amounts';
COMMENT ON FUNCTION process_pawn_amount_history_delete() IS 'Automatically inserts reversal records into pawn_history when pawn_amount_history records are deleted'; 