-- Create triggers for pawn_amount_history and credit_amount_history tables
-- These triggers automate the tracking of loan principal changes in the history tables

-- ===== PAWN AMOUNT HISTORY TRIGGERS =====

-- Function to handle insertion of pawn_amount_history records
CREATE OR REPLACE FUNCTION process_pawn_amount_history_insert()
RETURNS TRIGGER AS $$
DECLARE
  pawn_record pawns%ROWTYPE;
  transaction_type pawn_transaction_type;
  notes_text TEXT;
BEGIN
  -- Get pawn information
  SELECT * INTO pawn_record FROM pawns WHERE id = NEW.pawn_id;
  
  -- Determine transaction type based on note content or use a default
  IF NEW.note ILIKE '%trả gốc%' OR NEW.note ILIKE '%principal repayment%' THEN
    transaction_type := 'principal_repayment';
    notes_text := COALESCE(NEW.note, 'Trả gốc hợp đồng cầm đồ: ' || COALESCE(pawn_record.contract_code, pawn_record.id::text));
  ELSE
    transaction_type := 'new_loan';
    notes_text := COALESCE(NEW.note, 'Vay thêm hợp đồng cầm đồ: ' || COALESCE(pawn_record.contract_code, pawn_record.id::text));
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
    CASE WHEN transaction_type = 'new_loan' THEN pawn_record.loan_amount ELSE NULL END,
    CASE WHEN transaction_type = 'principal_repayment' THEN pawn_record.loan_amount ELSE NULL END,
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
BEGIN
  -- Insert a reversal record in pawn_history
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
    'other',  -- Using 'other' for reversals
    NULL,     -- No debit for reversal
    NULL,     -- No credit for reversal
    NOW(),
    'Hủy bỏ ghi chép: ' || COALESCE(OLD.note, 'Không có ghi chú'),
    NOW(),
    NOW()
  );
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for pawn_amount_history
CREATE TRIGGER trigger_pawn_amount_history_insert
  AFTER INSERT ON pawn_amount_history
  FOR EACH ROW
  EXECUTE FUNCTION process_pawn_amount_history_insert();

CREATE TRIGGER trigger_pawn_amount_history_delete
  AFTER DELETE ON pawn_amount_history
  FOR EACH ROW
  EXECUTE FUNCTION process_pawn_amount_history_delete();

-- ===== CREDIT AMOUNT HISTORY TRIGGERS =====

-- Function to handle insertion of credit_amount_history records
CREATE OR REPLACE FUNCTION process_credit_amount_history_insert()
RETURNS TRIGGER AS $$
DECLARE
  credit_record credits%ROWTYPE;
  transaction_type credit_transaction_type;
  description_text TEXT;
BEGIN
  -- Get credit information
  SELECT * INTO credit_record FROM credits WHERE id = NEW.credit_id;
  
  -- Determine transaction type based on note content or use a default
  IF NEW.note ILIKE '%trả gốc%' OR NEW.note ILIKE '%principal repayment%' THEN
    transaction_type := 'principal_repayment';
    description_text := COALESCE(NEW.note, 'Trả gốc hợp đồng tín dụng: ' || COALESCE(credit_record.contract_code, credit_record.id::text));
  ELSE
    transaction_type := 'additional_loan';
    description_text := COALESCE(NEW.note, 'Vay thêm hợp đồng tín dụng: ' || COALESCE(credit_record.contract_code, credit_record.id::text));
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
    CASE WHEN transaction_type = 'additional_loan' THEN credit_record.loan_amount ELSE NULL END,
    CASE WHEN transaction_type = 'principal_repayment' THEN credit_record.loan_amount ELSE NULL END,
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
BEGIN
  -- Insert a reversal record in credit_history
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
    'payment_cancel',  -- Using 'payment_cancel' for reversals
    NULL,              -- No debit for reversal
    NULL,              -- No credit for reversal
    'Hủy bỏ ghi chép: ' || COALESCE(OLD.note, 'Không có ghi chú'),
    NULL,              -- Could be linked to session user if needed
    NOW()
  );
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for credit_amount_history
CREATE TRIGGER trigger_credit_amount_history_insert
  AFTER INSERT ON credit_amount_history
  FOR EACH ROW
  EXECUTE FUNCTION process_credit_amount_history_insert();

CREATE TRIGGER trigger_credit_amount_history_delete
  AFTER DELETE ON credit_amount_history
  FOR EACH ROW
  EXECUTE FUNCTION process_credit_amount_history_delete();

-- Add comments for documentation
COMMENT ON FUNCTION process_pawn_amount_history_insert() IS 'Automatically inserts records into pawn_history when new pawn_amount_history records are created';
COMMENT ON FUNCTION process_pawn_amount_history_delete() IS 'Records reversals in pawn_history when pawn_amount_history records are deleted';
COMMENT ON FUNCTION process_credit_amount_history_insert() IS 'Automatically inserts records into credit_history when new credit_amount_history records are created';
COMMENT ON FUNCTION process_credit_amount_history_delete() IS 'Records reversals in credit_history when credit_amount_history records are deleted'; 