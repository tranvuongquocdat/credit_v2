-- Create trigger functions and triggers for automatic cash fund management in pawn transactions

-- Function to update store cash fund when pawn is created (money goes out)
CREATE OR REPLACE FUNCTION update_cash_fund_on_pawn_create()
RETURNS TRIGGER AS $$
BEGIN
  -- Decrease cash fund when pawn is created (money lent out)
  UPDATE stores 
  SET cash_fund = cash_fund - NEW.loan_amount,
      updated_at = NOW()
  WHERE id = NEW.store_id;
  
  -- Log the transaction in pawn_history (debit = money out)
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
    NEW.id,
    'new_loan',
    NEW.loan_amount,  -- debit_amount = money going out
    NULL,             -- credit_amount = NULL (no money coming in)
    NEW.loan_date,
    'Giải ngân hợp đồng cầm đồ: ' || COALESCE(NEW.contract_code, NEW.id::text),
    NOW(),
    NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update store cash fund when pawn is updated (loan amount changes)
CREATE OR REPLACE FUNCTION update_cash_fund_on_pawn_update()
RETURNS TRIGGER AS $$
DECLARE
  amount_difference NUMERIC;
BEGIN
  -- Only process if loan_amount has changed
  IF OLD.loan_amount != NEW.loan_amount THEN
    amount_difference := NEW.loan_amount - OLD.loan_amount;
    
    -- Update cash fund (negative if loan increased, positive if loan decreased)
    UPDATE stores 
    SET cash_fund = cash_fund - amount_difference,
        updated_at = NOW()
    WHERE id = NEW.store_id;
    
    -- Log the transaction in pawn_history
    IF amount_difference > 0 THEN
      -- Additional loan (money going out)
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
        NEW.id,
        'new_loan',
        amount_difference,  -- debit_amount = additional money out
        NULL,
        NOW(),
        'Vay thêm hợp đồng cầm đồ: ' || COALESCE(NEW.contract_code, NEW.id::text),
        NOW(),
        NOW()
      );
    ELSE
      -- Principal repayment (money coming back)
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
        NEW.id,
        'principal_repayment',
        NULL,
        ABS(amount_difference),  -- credit_amount = money coming back
        NOW(),
        'Trả gốc hợp đồng cầm đồ: ' || COALESCE(NEW.contract_code, NEW.id::text),
        NOW(),
        NOW()
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update store cash fund when pawn is closed/redeemed (money comes back)
CREATE OR REPLACE FUNCTION update_cash_fund_on_pawn_close()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if status changed to 'closed'
  IF OLD.status != 'closed' AND NEW.status = 'closed' THEN
    -- Add back the remaining loan amount to cash fund
    UPDATE stores 
    SET cash_fund = cash_fund + NEW.loan_amount,
        updated_at = NOW()
    WHERE id = NEW.store_id;
    
    -- Log the transaction in pawn_history (credit = money coming back)
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
      NEW.id,
      'contract_close',
      NULL,
      NEW.loan_amount,  -- credit_amount = money coming back
      NOW(),
      'Chuộc đồ hợp đồng: ' || COALESCE(NEW.contract_code, NEW.id::text),
      NOW(),
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update store cash fund when pawn payment is made (interest income)
CREATE OR REPLACE FUNCTION update_cash_fund_on_pawn_payment()
RETURNS TRIGGER AS $$
DECLARE
  pawn_record pawns%ROWTYPE;
BEGIN
  -- Get pawn information
  SELECT * INTO pawn_record FROM pawns WHERE id = NEW.pawn_id;
  
  -- Only process if actual_amount has increased
  IF (OLD.actual_amount IS NULL OR OLD.actual_amount = 0) AND NEW.actual_amount > 0 THEN
    -- Add payment to cash fund (interest income)
    UPDATE stores 
    SET cash_fund = cash_fund + NEW.actual_amount,
        updated_at = NOW()
    WHERE id = pawn_record.store_id;
    
    -- Log the transaction in pawn_history (credit = money coming in)
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
      'payment',
      NULL,
      NEW.actual_amount,  -- credit_amount = interest payment coming in
      COALESCE(NEW.payment_date, NOW()),
      'Thu lãi kỳ ' || NEW.period_number || ' hợp đồng: ' || COALESCE(pawn_record.contract_code, pawn_record.id::text),
      NOW(),
      NOW()
    );
  ELSIF OLD.actual_amount IS NOT NULL AND OLD.actual_amount != NEW.actual_amount THEN
    -- Handle payment amount changes
    DECLARE
      amount_difference NUMERIC := NEW.actual_amount - OLD.actual_amount;
    BEGIN
      UPDATE stores 
      SET cash_fund = cash_fund + amount_difference,
          updated_at = NOW()
      WHERE id = pawn_record.store_id;
      
      -- Log the adjustment in pawn_history
      IF amount_difference > 0 THEN
        -- Additional payment (credit)
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
          'payment',
          NULL,
          amount_difference,
          COALESCE(NEW.payment_date, NOW()),
          'Điều chỉnh tăng thanh toán kỳ ' || NEW.period_number || ' hợp đồng: ' || COALESCE(pawn_record.contract_code, pawn_record.id::text),
          NOW(),
          NOW()
        );
      ELSE
        -- Payment reduction (debit)
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
          'other',
          ABS(amount_difference),
          NULL,
          COALESCE(NEW.payment_date, NOW()),
          'Điều chỉnh giảm thanh toán kỳ ' || NEW.period_number || ' hợp đồng: ' || COALESCE(pawn_record.contract_code, pawn_record.id::text),
          NOW(),
          NOW()
        );
      END IF;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle payment deletion (reverse cash fund)
CREATE OR REPLACE FUNCTION update_cash_fund_on_pawn_payment_delete()
RETURNS TRIGGER AS $$
DECLARE
  pawn_record pawns%ROWTYPE;
BEGIN
  -- Get pawn information
  SELECT * INTO pawn_record FROM pawns WHERE id = OLD.pawn_id;
  
  -- Reverse the payment from cash fund
  IF OLD.actual_amount > 0 THEN
    UPDATE stores 
    SET cash_fund = cash_fund - OLD.actual_amount,
        updated_at = NOW()
    WHERE id = pawn_record.store_id;
    
    -- Log the reversal in pawn_history (debit = money going out due to reversal)
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
      'other',
      OLD.actual_amount,  -- debit_amount = money going out due to reversal
      NULL,
      NOW(),
      'Hủy thanh toán kỳ ' || OLD.period_number || ' hợp đồng: ' || COALESCE(pawn_record.contract_code, pawn_record.id::text),
      NOW(),
      NOW()
    );
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create triggers

-- Trigger for pawn creation (money goes out)
CREATE TRIGGER trigger_pawn_create_cash_fund
  AFTER INSERT ON pawns
  FOR EACH ROW
  EXECUTE FUNCTION update_cash_fund_on_pawn_create();

-- Trigger for pawn updates (loan amount changes)
CREATE TRIGGER trigger_pawn_update_cash_fund
  AFTER UPDATE ON pawns
  FOR EACH ROW
  EXECUTE FUNCTION update_cash_fund_on_pawn_update();

-- Trigger for pawn closure (money comes back)
CREATE TRIGGER trigger_pawn_close_cash_fund
  AFTER UPDATE ON pawns
  FOR EACH ROW
  EXECUTE FUNCTION update_cash_fund_on_pawn_close();

-- Trigger for pawn payments (interest income)
CREATE TRIGGER trigger_pawn_payment_cash_fund
  AFTER INSERT OR UPDATE ON pawn_payment_periods
  FOR EACH ROW
  EXECUTE FUNCTION update_cash_fund_on_pawn_payment();

-- Trigger for pawn payment deletion (reverse income)
CREATE TRIGGER trigger_pawn_payment_delete_cash_fund
  AFTER DELETE ON pawn_payment_periods
  FOR EACH ROW
  EXECUTE FUNCTION update_cash_fund_on_pawn_payment_delete();

-- Add comments for documentation
COMMENT ON FUNCTION update_cash_fund_on_pawn_create() IS 'Automatically decreases store cash fund and logs to pawn_history when a pawn contract is created';
COMMENT ON FUNCTION update_cash_fund_on_pawn_update() IS 'Automatically adjusts store cash fund and logs to pawn_history when pawn loan amount changes';
COMMENT ON FUNCTION update_cash_fund_on_pawn_close() IS 'Automatically increases store cash fund and logs to pawn_history when a pawn contract is closed/redeemed';
COMMENT ON FUNCTION update_cash_fund_on_pawn_payment() IS 'Automatically increases store cash fund and logs to pawn_history when pawn interest payments are made';
COMMENT ON FUNCTION update_cash_fund_on_pawn_payment_delete() IS 'Automatically reverses store cash fund and logs to pawn_history when pawn payments are deleted'; 