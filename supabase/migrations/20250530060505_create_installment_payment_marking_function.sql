-- Create function to handle installment payment marking with auto-fill missing periods
CREATE OR REPLACE FUNCTION handle_installment_payment_marking(
  p_installment_id UUID,
  p_periods JSONB,
  p_action TEXT
) RETURNS JSONB AS $$

DECLARE
  period_record JSONB;
  period_id UUID;
  period_id_string TEXT;
  v_period_number INTEGER;
  expected_amount NUMERIC;
  other_amount NUMERIC;
  input_actual_amount NUMERIC;
  final_actual_amount NUMERIC;
  start_date DATE;
  end_date DATE;
  payment_date DATE;
  existing_period RECORD;
  result JSONB := '{"success": true, "processed_periods": []}'::JSONB;
  processed_periods JSONB := '[]'::JSONB;
  error_message TEXT;
  
  -- Variables for auto-fill logic
  missing_period_num INTEGER;
  installment_info RECORD;
  calculated_start_date DATE;
  calculated_end_date DATE;
  calculated_amount NUMERIC;
  
  -- Variables for payment history logging (only for mark action)
  total_payment_amount NUMERIC := 0;
  payment_description TEXT;
  periods_array JSONB;
  
  -- Variables for payment_due_date update
  next_unpaid_period RECORD;
  last_period_number INTEGER;
  calculated_last_period INTEGER;
BEGIN
  -- Validate action
  IF p_action NOT IN ('mark', 'unmark') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Must be "mark" or "unmark"');
  END IF;

  -- Get installment info for calculations
  SELECT * INTO installment_info FROM installments WHERE id = p_installment_id;
  IF installment_info.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Installment not found');
  END IF;

  -- Parse periods - handle both string and JSONB input
  BEGIN
    IF jsonb_typeof(p_periods) = 'string' THEN
      periods_array := p_periods::text::jsonb;
    ELSE
      periods_array := p_periods;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid periods format: ' || SQLERRM);
  END;

  -- Validate that periods_array is an array
  IF jsonb_typeof(periods_array) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Periods must be an array');
  END IF;

  -- Process each period
  FOR period_record IN SELECT * FROM jsonb_array_elements(periods_array)
  LOOP
    BEGIN
      -- Extract period data safely
      period_id_string := period_record->>'id';
      v_period_number := (period_record->>'periodNumber')::INTEGER;
      expected_amount := COALESCE((period_record->>'expectedAmount')::NUMERIC, 0);
      other_amount := COALESCE((period_record->>'otherAmount')::NUMERIC, 0);
      
      -- Determine the actual payment amount: use actualAmount if provided and non-zero, otherwise use expectedAmount
      input_actual_amount := COALESCE((period_record->>'actualAmount')::NUMERIC, 0);
      
      -- If actualAmount is provided and non-zero, use it; otherwise use expectedAmount
      IF input_actual_amount > 0 THEN
        final_actual_amount := input_actual_amount;
      ELSE
        final_actual_amount := expected_amount;
      END IF;
      
      -- Handle date parsing from DD/MM/YYYY format
      BEGIN
        -- Parse dueDate from DD/MM/YYYY to DATE
        IF period_record->>'dueDate' IS NOT NULL THEN
          start_date := TO_DATE(period_record->>'dueDate', 'DD/MM/YYYY');
        ELSE
          start_date := CURRENT_DATE;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        start_date := CURRENT_DATE;
      END;
      
      BEGIN
        -- Parse endDate from DD/MM/YYYY to DATE
        IF period_record->>'endDate' IS NOT NULL THEN
          end_date := TO_DATE(period_record->>'endDate', 'DD/MM/YYYY');
        ELSE
          end_date := start_date + (installment_info.payment_period || 10);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        end_date := start_date + (installment_info.payment_period || 10);
      END;
      
      -- Set payment date to today for new payments
      payment_date := CURRENT_DATE;

      -- Only try to cast to UUID if it's not a calculated/temp ID
      IF period_id_string IS NOT NULL AND 
         period_id_string NOT LIKE 'calculated-%' AND 
         period_id_string NOT LIKE 'temp-%' AND
         period_id_string NOT LIKE 'estimated-%' THEN
        BEGIN
          period_id := period_id_string::UUID;
        EXCEPTION WHEN OTHERS THEN
          period_id := NULL;
        END;
      ELSE
        period_id := NULL;
      END IF;

      IF p_action = 'mark' THEN
        -- Check if this is a calculated period (no real ID or starts with 'calculated-'/'temp-'/'estimated-')
        IF period_id IS NULL OR 
           period_id_string LIKE 'calculated-%' OR 
           period_id_string LIKE 'temp-%' OR
           period_id_string LIKE 'estimated-%' THEN
          
          -- 🚀 AUTO-FILL MISSING PERIODS
          -- For periods > 1, auto-create any missing previous periods
          IF v_period_number > 1 THEN
            FOR missing_period_num IN 1..(v_period_number - 1) LOOP
              -- Check if this period exists and is paid (use table alias to avoid ambiguity)
              SELECT ipp.* INTO existing_period 
              FROM installment_payment_period ipp
              WHERE ipp.installment_id = p_installment_id 
                AND ipp.period_number = missing_period_num;
              
              -- If period doesn't exist or isn't fully paid, create/update it
              IF existing_period.id IS NULL THEN
                -- Calculate dates for missing period based on payment_period
                calculated_start_date := installment_info.loan_date::DATE + ((missing_period_num - 1) * (installment_info.payment_period || 10));
                calculated_end_date := calculated_start_date + (installment_info.payment_period || 10) - 1;
                
                -- Use the expected amount from the installment calculation
                calculated_amount := COALESCE(expected_amount, installment_info.installment_amount / CEIL(installment_info.loan_period::NUMERIC / (installment_info.payment_period || 10)));
                
                -- Create missing period
                INSERT INTO installment_payment_period (
                  installment_id,
                  period_number,
                  date,
                  payment_end_date,
                  expected_amount,
                  actual_amount,
                  payment_start_date,
                  notes
                ) VALUES (
                  p_installment_id,
                  missing_period_num,
                  calculated_start_date,
                  calculated_end_date,
                  calculated_amount,
                  calculated_amount, -- For auto-created periods, actual = expected
                  payment_date,
                  'Auto-created via checkbox for sequential payment'
                ) RETURNING id INTO period_id;
                
                -- Add to total payment amount for history logging
                total_payment_amount := total_payment_amount + calculated_amount;
                
                processed_periods := processed_periods || jsonb_build_object(
                  'period_number', missing_period_num,
                  'status', 'auto_created',
                  'id', period_id
                );
                
              ELSIF existing_period.actual_amount < existing_period.expected_amount THEN
                -- Update existing unpaid period (use qualified column names)
                UPDATE installment_payment_period 
                SET 
                  actual_amount = existing_period.expected_amount,
                  payment_start_date = payment_date,
                  notes = 'Auto-paid via checkbox for sequential payment',
                  updated_at = NOW()
                WHERE id = existing_period.id;
                
                -- Add to total payment amount for history logging
                total_payment_amount := total_payment_amount + (existing_period.expected_amount - existing_period.actual_amount);
                
                processed_periods := processed_periods || jsonb_build_object(
                  'period_number', missing_period_num,
                  'status', 'auto_updated',
                  'id', existing_period.id
                );
              END IF;
            END LOOP;
          END IF;
          
          -- Now process the requested period
          SELECT ipp.* INTO existing_period 
          FROM installment_payment_period ipp
          WHERE ipp.installment_id = p_installment_id 
            AND ipp.period_number = v_period_number
          FOR UPDATE;
          
          IF existing_period.id IS NOT NULL THEN
            -- Period already exists, check if it's already paid
            IF existing_period.actual_amount >= existing_period.expected_amount THEN
              processed_periods := processed_periods || jsonb_build_object(
                'period_number', v_period_number,
                'status', 'already_paid',
                'id', existing_period.id
              );
              CONTINUE;
            ELSE
              -- Update existing period - use final_actual_amount (which could be user-edited amount)
              UPDATE installment_payment_period 
              SET 
                actual_amount = final_actual_amount, -- Use final_actual_amount which includes user edits
                payment_start_date = payment_date,
                notes = 'Đóng tiền qua checkbox',
                updated_at = NOW()
              WHERE id = existing_period.id;
              
              -- Add to total payment amount for history logging
              total_payment_amount := total_payment_amount + (final_actual_amount - existing_period.actual_amount);
              
              processed_periods := processed_periods || jsonb_build_object(
                'period_number', v_period_number,
                'status', 'updated',
                'id', existing_period.id
              );
            END IF;
          ELSE
            -- Create new period - use expected_amount from input for both expected and actual
            INSERT INTO installment_payment_period (
              installment_id,
              period_number,
              date,
              payment_end_date,
              expected_amount,
              actual_amount,
              payment_start_date,
              notes
            ) VALUES (
              p_installment_id,
              v_period_number,
              start_date,
              end_date,
              expected_amount, -- Expected amount from input
              final_actual_amount, -- Actual amount = expected amount when paying via checkbox
              payment_date,
              'Đóng tiền qua checkbox'
            ) RETURNING id INTO period_id;
            
            -- Add to total payment amount for history logging
            total_payment_amount := total_payment_amount + final_actual_amount;
            
            processed_periods := processed_periods || jsonb_build_object(
              'period_number', v_period_number,
              'status', 'created',
              'id', period_id
            );
          END IF;
        ELSE
          -- Real period ID logic
          SELECT ipp.* INTO existing_period 
          FROM installment_payment_period ipp
          WHERE ipp.id = period_id
          FOR UPDATE;
          
          IF existing_period.id IS NULL THEN
            processed_periods := processed_periods || jsonb_build_object(
              'period_number', v_period_number,
              'status', 'not_found',
              'id', period_id
            );
            CONTINUE;
          END IF;
          
          IF existing_period.actual_amount >= existing_period.expected_amount THEN
            processed_periods := processed_periods || jsonb_build_object(
              'period_number', v_period_number,
              'status', 'already_paid',
              'id', period_id
            );
            CONTINUE;
          END IF;
          
          -- Add to total payment amount for history logging
          total_payment_amount := total_payment_amount + (final_actual_amount - existing_period.actual_amount);
          
          UPDATE installment_payment_period 
          SET 
            actual_amount = final_actual_amount, -- Use final_actual_amount which includes user edits
            payment_start_date = payment_date,
            notes = 'Đóng tiền qua checkbox',
            updated_at = NOW()
          WHERE id = period_id;
          
          processed_periods := processed_periods || jsonb_build_object(
            'period_number', v_period_number,
            'status', 'updated',
            'id', period_id
          );
        END IF;
        
      ELSIF p_action = 'unmark' THEN
        -- Unmark payment (no history logging here, triggers will handle it)
        IF period_id IS NULL OR 
           period_id_string LIKE 'calculated-%' OR 
           period_id_string LIKE 'temp-%' OR
           period_id_string LIKE 'estimated-%' THEN
          processed_periods := processed_periods || jsonb_build_object(
            'period_number', v_period_number,
            'status', 'cannot_unmark_calculated',
            'id', period_id_string
          );
          CONTINUE;
        END IF;
        
        SELECT ipp.* INTO existing_period 
        FROM installment_payment_period ipp
        WHERE ipp.id = period_id
        FOR UPDATE;
        
        IF existing_period.id IS NULL THEN
          processed_periods := processed_periods || jsonb_build_object(
            'period_number', v_period_number,
            'status', 'not_found',
            'id', period_id
          );
          CONTINUE;
        END IF;
        
        -- Check for later payments - use qualified column names
        IF EXISTS (
          SELECT 1 FROM installment_payment_period ipp2
          WHERE ipp2.installment_id = p_installment_id 
            AND ipp2.period_number > existing_period.period_number
            AND ipp2.actual_amount >= ipp2.expected_amount
        ) THEN
          processed_periods := processed_periods || jsonb_build_object(
            'period_number', v_period_number,
            'status', 'cannot_unmark_has_later_payments',
            'id', period_id
          );
          CONTINUE;
        END IF;
        
        -- Delete period (trigger will handle history logging)
        DELETE FROM installment_payment_period WHERE id = period_id;
        
        processed_periods := processed_periods || jsonb_build_object(
          'period_number', v_period_number,
          'status', 'deleted',
          'id', period_id
        );
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      processed_periods := processed_periods || jsonb_build_object(
        'period_number', COALESCE(v_period_number, 0),
        'status', 'error',
        'error', SQLERRM,
        'id', COALESCE(period_id_string, 'unknown')
      );
    END;
  END LOOP;
  
  -- 📝 LOG PAYMENT HISTORY (only for mark action)
  -- Only log if there was actual payment activity and total amount > 0
  IF total_payment_amount > 0 AND p_action = 'mark' THEN
    -- Create description based on number of periods processed
    payment_description := 'Đóng tiền trả góp qua checkbox';
    IF jsonb_array_length(processed_periods) > 1 THEN
      payment_description := payment_description || ' (' || jsonb_array_length(processed_periods) || ' kỳ)';
    END IF;
    payment_description := payment_description || ' - Hợp đồng: ' || COALESCE(installment_info.contract_code, installment_info.id::text);
    
    -- Insert into installment_history
    INSERT INTO installment_history (
      installment_id,
      transaction_type,
      debit_amount,
      credit_amount,
      description,
      employee_id,
      created_at
    ) VALUES (
      p_installment_id,
      'payment',
      0,                        -- debit_amount = 0 for payments
      total_payment_amount,     -- credit_amount = money coming in
      payment_description,
      NULL,                     -- Could be linked to session user if needed
      NOW()
    );
  END IF;
  
  -- 🔄 UPDATE PAYMENT_DUE_DATE
  -- After all periods have been processed, update the payment_due_date field
  
  -- For unmark action, get end_date from the deleted period 
  -- This is a simpler approach that sets payment_due_date to the end_date of the unmarked period
  IF p_action = 'unmark' THEN
    -- Look for the EARLIEST unmarked period (the one with lowest period_number)
    -- This is the one that should become the next payment due date
    DECLARE
      deleted_periods JSONB;
      min_period_number INTEGER := NULL;
      unmarked_period_end_date DATE := NULL;
    BEGIN
      -- Create array of deleted periods
      deleted_periods := '[]'::JSONB;
      
      -- Filter and collect deleted periods
      FOR period_record IN SELECT * FROM jsonb_array_elements(processed_periods)
      LOOP
        IF period_record->>'status' = 'deleted' THEN
          deleted_periods := deleted_periods || period_record;
        END IF;
      END LOOP;
      
      -- If we have deleted periods, find the one with lowest period_number
      IF jsonb_array_length(deleted_periods) > 0 THEN
        -- Find the lowest period_number in deleted_periods
        SELECT MIN((p->>'period_number')::INTEGER) INTO min_period_number
        FROM jsonb_array_elements(deleted_periods) p;
        
        -- Now we have the earliest unmarked period number
        -- We'll update payment_due_date with this period's end_date
        IF min_period_number IS NOT NULL THEN
          -- This period was just deleted from DB, but its end_date was passed in the input
          -- We need to find it in the original input periods_array
          FOR period_record IN SELECT * FROM jsonb_array_elements(periods_array)
          LOOP
            IF (period_record->>'periodNumber')::INTEGER = min_period_number THEN
              -- Found the period, extract its end date
              BEGIN
                IF period_record->>'endDate' IS NOT NULL THEN
                  unmarked_period_end_date := TO_DATE(period_record->>'endDate', 'DD/MM/YYYY');
                END IF;
              EXCEPTION WHEN OTHERS THEN
                -- If parsing fails, use current date as fallback
                unmarked_period_end_date := CURRENT_DATE;
              END;
              
              EXIT; -- Found what we need, exit loop
            END IF;
          END LOOP;
          
          -- Update installment with this date
          IF unmarked_period_end_date IS NOT NULL THEN
            -- Đúng như yêu cầu: Khi uncheck, lấy ngày cuối cùng của kỳ bị uncheck làm payment_due_date
            UPDATE installments
            SET payment_due_date = unmarked_period_end_date,
                updated_at = NOW()
            WHERE id = p_installment_id;
            
            -- Add to result for logging
            result := jsonb_set(result, '{payment_due_date_action}', 
              jsonb_build_object(
                'action', 'set_to_unmarked_period_end_date',
                'period_number', min_period_number,
                'date', unmarked_period_end_date
              )
            );
          END IF;
        END IF;
      END IF;
    END;
  ELSE -- For mark action, keep existing calculation logic for next payment due date
    -- Calculate the theoretical last period based on loan loan_period and payment period
    calculated_last_period := CEIL(installment_info.loan_period::NUMERIC / installment_info.payment_period::NUMERIC);
    
    -- Find the highest period number that has been marked as paid - use qualified column names
    SELECT MAX(ipp.period_number) INTO last_period_number
    FROM installment_payment_period ipp
    WHERE ipp.installment_id = p_installment_id
      AND ipp.actual_amount >= ipp.expected_amount;
    
    -- If we just marked the last period of the loan, set payment_due_date to NULL
    IF last_period_number = calculated_last_period THEN
      -- Đúng như yêu cầu: Nếu đây là kỳ cuối cùng của hợp đồng, set payment_due_date về null
      UPDATE installments
      SET payment_due_date = NULL,
          updated_at = NOW()
      WHERE id = p_installment_id;
      
      -- Add to result for logging
      result := jsonb_set(result, '{payment_due_date_action}', '"cleared"'::jsonb);
    ELSE
      -- Tính toán ngày kết thúc của hợp đồng để so sánh
      DECLARE
        contract_end_date DATE;
      BEGIN
        -- Lấy ngày kết thúc từ ngày bắt đầu + loan_period
        contract_end_date := installment_info.loan_date::DATE + installment_info.loan_period::INTEGER - 1;
        
        -- Find the next unpaid period - use qualified column names
        SELECT ipp.* INTO next_unpaid_period
        FROM installment_payment_period ipp
        WHERE ipp.installment_id = p_installment_id
          AND (ipp.actual_amount IS NULL OR ipp.actual_amount < ipp.expected_amount)
        ORDER BY ipp.period_number
        LIMIT 1;
        
        IF next_unpaid_period.id IS NULL THEN
          -- No unpaid periods in database, calculate the next period manually
          IF last_period_number IS NULL THEN
            -- No payments yet, use loan start date
            UPDATE installments
            SET payment_due_date = (installment_info.loan_date::DATE + installment_info.payment_period::INTEGER - 1),
                updated_at = NOW()
            WHERE id = p_installment_id;
            
            -- Add to result for logging
            result := jsonb_set(result, '{payment_due_date_action}', '"set_to_first_period"'::jsonb);
          ELSE
            -- Calculate the end date of the next period after the last paid one
            DECLARE
              calculated_next_end_date DATE;
            BEGIN
              calculated_next_end_date := (
                installment_info.loan_date::DATE + 
                (last_period_number * installment_info.payment_period::INTEGER) + 
                installment_info.payment_period::INTEGER - 1
              );
              
              -- Check if calculated end date exceeds contract end date
              -- If so, use contract end date instead
              IF calculated_next_end_date > contract_end_date THEN
                calculated_next_end_date := contract_end_date;
                
                -- Log that we're using contract end date because it's shorter
                result := jsonb_set(result, '{payment_due_date_action}', 
                  jsonb_build_object(
                    'action', 'using_contract_end_date',
                    'last_period', last_period_number,
                    'next_period', last_period_number + 1,
                    'original_calculated_date', (installment_info.loan_date::DATE + 
                                                (last_period_number * installment_info.payment_period::INTEGER) + 
                                                installment_info.payment_period::INTEGER - 1),
                    'adjusted_to', contract_end_date
                  )
                );
              ELSE
                -- Add to result for logging (normal case)
                result := jsonb_set(result, '{payment_due_date_action}', 
                  jsonb_build_object(
                    'action', 'calculated_next_period',
                    'last_period', last_period_number,
                    'next_period', last_period_number + 1
                  )
                );
              END IF;
              
              -- Update with either calculated date or contract end date (whichever is earlier)
              UPDATE installments
              SET payment_due_date = calculated_next_end_date,
                  updated_at = NOW()
              WHERE id = p_installment_id;
            END;
          END IF;
        ELSE
          -- We found an existing next unpaid period
          -- Check if this is the last period with shorter duration
          IF next_unpaid_period.period_number = calculated_last_period AND 
             (next_unpaid_period.payment_end_date::DATE > contract_end_date) THEN
            -- Use contract end date instead
            UPDATE installments
            SET payment_due_date = contract_end_date,
                updated_at = NOW()
            WHERE id = p_installment_id;
            
            -- Log the adjustment
            result := jsonb_set(result, '{payment_due_date_action}', 
              jsonb_build_object(
                'action', 'adjusted_last_period_end_date',
                'period_number', next_unpaid_period.period_number,
                'original_date', next_unpaid_period.payment_end_date,
                'adjusted_to', contract_end_date
              )
            );
          ELSE
            -- Use the payment_end_date of the next unpaid period (normal case)
            UPDATE installments
            SET payment_due_date = next_unpaid_period.payment_end_date,
                updated_at = NOW()
            WHERE id = p_installment_id;
            
            -- Add to result for logging
            result := jsonb_set(result, '{payment_due_date_action}', 
              jsonb_build_object(
                'action', 'set_to_existing_period',
                'period_number', next_unpaid_period.period_number
              )
            );
          END IF;
        END IF;
      END;
    END IF;
  END IF;
  
  result := jsonb_set(result, '{processed_periods}', processed_periods);
  RETURN result;
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false, 
    'error', SQLERRM,
    'processed_periods', processed_periods
  );
END;
$$ LANGUAGE plpgsql;