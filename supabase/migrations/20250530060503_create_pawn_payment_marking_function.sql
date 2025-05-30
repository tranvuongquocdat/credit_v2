-- Create function to handle pawn payment marking with auto-fill missing periods
CREATE OR REPLACE FUNCTION handle_pawn_payment_marking(
  p_pawn_id UUID,
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
  pawn_info RECORD;
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

  -- Get pawn info for calculations
  SELECT * INTO pawn_info FROM pawns WHERE id = p_pawn_id;
  IF pawn_info.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pawn not found');
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
              -- Check if this period exists and is paid
              SELECT ppp.* INTO existing_period 
              FROM pawn_payment_periods ppp
              WHERE ppp.pawn_id = p_pawn_id 
                AND ppp.period_number = missing_period_num;
              
              -- If period doesn't exist or isn't fully paid, create/update it
              IF existing_period.id IS NULL THEN
                -- Calculate dates for missing period
                calculated_start_date := pawn_info.loan_date + ((missing_period_num - 1) * INTERVAL '1 day' * COALESCE(pawn_info.interest_period, 30));
                calculated_end_date := calculated_start_date + (INTERVAL '1 day' * COALESCE(pawn_info.interest_period, 30) - INTERVAL '1 day');
                
                -- Use a simple interest calculation (you can make this more sophisticated)
                calculated_interest := COALESCE(expected_amount, 100000); -- Default or calculate based on pawn info
                
                -- Create missing period
                INSERT INTO pawn_payment_periods (
                  pawn_id,
                  period_number,
                  start_date,
                  end_date,
                  expected_amount,
                  actual_amount,
                  other_amount,
                  payment_date,
                  notes
                ) VALUES (
                  p_pawn_id,
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
                UPDATE pawn_payment_periods 
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
          SELECT ppp.* INTO existing_period 
          FROM pawn_payment_periods ppp
          WHERE ppp.pawn_id = p_pawn_id 
            AND ppp.period_number = v_period_number
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
              UPDATE pawn_payment_periods 
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
            INSERT INTO pawn_payment_periods (
              pawn_id,
              period_number,
              start_date,
              end_date,
              expected_amount,
              actual_amount,
              other_amount,
              payment_date,
              notes
            ) VALUES (
              p_pawn_id,
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
          -- Real period ID logic
          SELECT ppp.* INTO existing_period 
          FROM pawn_payment_periods ppp
          WHERE ppp.id = period_id
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
          
          UPDATE pawn_payment_periods 
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
        
        SELECT ppp.* INTO existing_period 
        FROM pawn_payment_periods ppp
        WHERE ppp.id = period_id
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
          SELECT 1 FROM pawn_payment_periods ppp2
          WHERE ppp2.pawn_id = p_pawn_id 
            AND ppp2.period_number > existing_period.period_number
            AND ppp2.actual_amount >= ppp2.expected_amount
        ) THEN
          processed_periods := processed_periods || jsonb_build_object(
            'period_number', v_period_number,
            'status', 'cannot_unmark_has_later_payments',
            'id', period_id
          );
          CONTINUE;
        END IF;
        
        -- Delete period (trigger will handle history logging)
        DELETE FROM pawn_payment_periods WHERE id = period_id;
        
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
    payment_description := payment_description || ' - Hợp đồng: ' || COALESCE(pawn_info.contract_code, pawn_info.id::text);
    
    -- Insert into pawn_history
    INSERT INTO pawn_history (
      pawn_id,
      transaction_type,
      debit_amount,
      credit_amount,
      transaction_date,
      notes,
      employee_id,
      created_at,
      updated_at
    ) VALUES (
      p_pawn_id,
      'payment',
      NULL,                     -- debit_amount = NULL for payments
      total_payment_amount,     -- credit_amount = money coming in
      NOW(),
      payment_description,
      NULL,                     -- Could be linked to session user if needed
      NOW(),
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