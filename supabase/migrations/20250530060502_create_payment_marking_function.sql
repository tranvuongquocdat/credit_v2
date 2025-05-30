-- Create function to handle credit payment marking with auto-fill missing periods
CREATE OR REPLACE FUNCTION handle_payment_marking(
  p_credit_id UUID,
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
  start_date TIMESTAMP;
  end_date TIMESTAMP;
  existing_period RECORD;
  result JSONB := '{"success": true, "processed_periods": []}'::JSONB;
  processed_periods JSONB := '[]'::JSONB;
  error_message TEXT;
  
  -- Variables for auto-fill logic
  missing_period_num INTEGER;
  credit_info RECORD;
  calculated_start_date TIMESTAMP;
  calculated_end_date TIMESTAMP;
  calculated_interest NUMERIC;
  
  -- Variables for payment history logging (only for mark action)
  total_payment_amount NUMERIC := 0;
  payment_description TEXT;
BEGIN
  -- Validate action
  IF p_action NOT IN ('mark', 'unmark') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Must be "mark" or "unmark"');
  END IF;

  -- Get credit info for calculations
  SELECT * INTO credit_info FROM credits WHERE id = p_credit_id;
  IF credit_info.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Credit not found');
  END IF;

  -- Process each period
  FOR period_record IN SELECT * FROM jsonb_array_elements(p_periods)
  LOOP
    BEGIN
      -- Extract period data safely
      period_id_string := period_record->>'id';
      v_period_number := (period_record->>'period_number')::INTEGER;
      expected_amount := COALESCE((period_record->>'expected_amount')::NUMERIC, 0);
      other_amount := COALESCE((period_record->>'other_amount')::NUMERIC, 0);
      start_date := (period_record->>'start_date')::TIMESTAMP;
      end_date := (period_record->>'end_date')::TIMESTAMP;

      -- Only try to cast to UUID if it's not a calculated/temp ID
      IF period_id_string IS NOT NULL AND 
         period_id_string NOT LIKE 'calculated-%' AND 
         period_id_string NOT LIKE 'temp-%' THEN
        BEGIN
          period_id := period_id_string::UUID;
        EXCEPTION WHEN OTHERS THEN
          period_id := NULL;
        END;
      ELSE
        period_id := NULL;
      END IF;

      IF p_action = 'mark' THEN
        -- Check if this is a calculated period (no real ID or starts with 'calculated-'/'temp-')
        IF period_id IS NULL OR 
           period_id_string LIKE 'calculated-%' OR 
           period_id_string LIKE 'temp-%' THEN
          
          -- 🚀 AUTO-FILL MISSING PERIODS
          -- For periods > 1, auto-create any missing previous periods
          IF v_period_number > 1 THEN
            FOR missing_period_num IN 1..(v_period_number - 1) LOOP
              -- Check if this period exists and is paid
              SELECT cpp.* INTO existing_period 
              FROM credit_payment_periods cpp
              WHERE cpp.credit_id = p_credit_id 
                AND cpp.period_number = missing_period_num;
              
              -- If period doesn't exist or isn't fully paid, create/update it
              IF existing_period.id IS NULL THEN
                -- Calculate dates for missing period
                calculated_start_date := credit_info.loan_date + ((missing_period_num - 1) * INTERVAL '1 day' * COALESCE(credit_info.interest_period, 30));
                calculated_end_date := calculated_start_date + (INTERVAL '1 day' * COALESCE(credit_info.interest_period, 30) - INTERVAL '1 day');
                
                -- Use a simple interest calculation (you can make this more sophisticated)
                calculated_interest := COALESCE(expected_amount, 100000); -- Default or calculate based on credit info
                
                -- Create missing period
                INSERT INTO credit_payment_periods (
                  credit_id,
                  period_number,
                  start_date,
                  end_date,
                  expected_amount,
                  actual_amount,
                  other_amount,
                  payment_date,
                  notes
                ) VALUES (
                  p_credit_id,
                  missing_period_num,
                  calculated_start_date,
                  calculated_end_date,
                  calculated_interest,
                  calculated_interest,
                  0,
                  NOW(),
                  'Auto-created via checkbox for sequential payment'
                ) RETURNING id INTO period_id;
                
                -- Add to total payment amount for history logging
                total_payment_amount := total_payment_amount + calculated_interest;
                
                processed_periods := processed_periods || jsonb_build_object(
                  'period_number', missing_period_num,
                  'status', 'auto_created',
                  'id', period_id
                );
                
              ELSIF existing_period.actual_amount < existing_period.expected_amount THEN
                -- Update existing unpaid period
                UPDATE credit_payment_periods 
                SET 
                  actual_amount = existing_period.expected_amount,
                  payment_date = NOW(),
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
          SELECT cpp.* INTO existing_period 
          FROM credit_payment_periods cpp
          WHERE cpp.credit_id = p_credit_id 
            AND cpp.period_number = v_period_number
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
              -- Update existing period
              UPDATE credit_payment_periods 
              SET 
                actual_amount = expected_amount,
                payment_date = NOW(),
                notes = 'Đóng lãi qua checkbox',
                updated_at = NOW()
              WHERE id = existing_period.id;
              
              -- Add to total payment amount for history logging
              total_payment_amount := total_payment_amount + (expected_amount - existing_period.actual_amount);
              
              processed_periods := processed_periods || jsonb_build_object(
                'period_number', v_period_number,
                'status', 'updated',
                'id', existing_period.id
              );
            END IF;
          ELSE
            -- Create new period
            INSERT INTO credit_payment_periods (
              credit_id,
              period_number,
              start_date,
              end_date,
              expected_amount,
              actual_amount,
              other_amount,
              payment_date,
              notes
            ) VALUES (
              p_credit_id,
              v_period_number,
              start_date,
              end_date,
              expected_amount,
              expected_amount,
              other_amount,
              NOW(),
              'Đóng lãi qua checkbox'
            ) RETURNING id INTO period_id;
            
            -- Add to total payment amount for history logging
            total_payment_amount := total_payment_amount + expected_amount;
            
            processed_periods := processed_periods || jsonb_build_object(
              'period_number', v_period_number,
              'status', 'created',
              'id', period_id
            );
          END IF;
        ELSE
          -- Real period ID logic (unchanged)
          SELECT cpp.* INTO existing_period 
          FROM credit_payment_periods cpp
          WHERE cpp.id = period_id
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
          total_payment_amount := total_payment_amount + (expected_amount - existing_period.actual_amount);
          
          UPDATE credit_payment_periods 
          SET 
            actual_amount = expected_amount,
            payment_date = NOW(),
            notes = 'Đóng lãi qua checkbox',
            updated_at = NOW()
          WHERE id = period_id;
          
          processed_periods := processed_periods || jsonb_build_object(
            'period_number', v_period_number,
            'status', 'updated',
            'id', period_id
          );
        END IF;
        
      ELSIF p_action = 'unmark' THEN
        -- Unmark logic (unchanged - no history logging here, triggers will handle it)
        IF period_id IS NULL OR 
           period_id_string LIKE 'calculated-%' OR 
           period_id_string LIKE 'temp-%' THEN
          processed_periods := processed_periods || jsonb_build_object(
            'period_number', v_period_number,
            'status', 'cannot_unmark_calculated',
            'id', period_id_string
          );
          CONTINUE;
        END IF;
        
        SELECT cpp.* INTO existing_period 
        FROM credit_payment_periods cpp
        WHERE cpp.id = period_id
        FOR UPDATE;
        
        IF existing_period.id IS NULL THEN
          processed_periods := processed_periods || jsonb_build_object(
            'period_number', v_period_number,
            'status', 'not_found',
            'id', period_id
          );
          CONTINUE;
        END IF;
        
        IF EXISTS (
          SELECT 1 FROM credit_payment_periods cpp2
          WHERE cpp2.credit_id = p_credit_id 
            AND cpp2.period_number > existing_period.period_number
            AND cpp2.actual_amount >= cpp2.expected_amount
        ) THEN
          processed_periods := processed_periods || jsonb_build_object(
            'period_number', v_period_number,
            'status', 'cannot_unmark_has_later_payments',
            'id', period_id
          );
          CONTINUE;
        END IF;
        
        -- Delete period (trigger will handle history logging)
        DELETE FROM credit_payment_periods WHERE id = period_id;
        
        processed_periods := processed_periods || jsonb_build_object(
          'period_number', v_period_number,
          'status', 'deleted',
          'id', period_id
        );
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      processed_periods := processed_periods || jsonb_build_object(
        'period_number', v_period_number,
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
    payment_description := 'Đóng lãi phí qua checkbox';
    IF jsonb_array_length(processed_periods) > 1 THEN
      payment_description := payment_description || ' (' || jsonb_array_length(processed_periods) || ' kỳ)';
    END IF;
    payment_description := payment_description || ' - Hợp đồng: ' || COALESCE(credit_info.contract_code, credit_info.id::text);
    
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
      p_credit_id,
      'payment',
      0,                        -- debit_amount = 0 for payments
      total_payment_amount,     -- credit_amount = money coming in
      payment_description,
      NULL,                     -- Could be linked to session user if needed
      NOW()
    );
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