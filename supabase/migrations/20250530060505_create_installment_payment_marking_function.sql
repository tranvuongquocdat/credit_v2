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
              -- Check if this period exists and is paid
              SELECT ipp.* INTO existing_period 
              FROM installment_payment_period ipp
              WHERE ipp.installment_id = p_installment_id 
                AND ipp.period_number = missing_period_num;
              
              -- If period doesn't exist or isn't fully paid, create/update it
              IF existing_period.id IS NULL THEN
                -- Calculate dates for missing period based on payment_period
                calculated_start_date := installment_info.start_date::DATE + ((missing_period_num - 1) * (installment_info.payment_period || 10));
                calculated_end_date := calculated_start_date + (installment_info.payment_period || 10) - 1;
                
                -- Use the expected amount from the installment calculation
                calculated_amount := COALESCE(expected_amount, installment_info.installment_amount / CEIL(installment_info.duration::NUMERIC / (installment_info.payment_period || 10)));
                
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
                  calculated_amount,
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
                -- Update existing unpaid period
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
              -- Update existing period
              UPDATE installment_payment_period 
              SET 
                actual_amount = expected_amount,
                payment_start_date = payment_date,
                notes = 'Đóng tiền qua checkbox',
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
              expected_amount,
              expected_amount,
              payment_date,
              'Đóng tiền qua checkbox'
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
          total_payment_amount := total_payment_amount + (expected_amount - existing_period.actual_amount);
          
          UPDATE installment_payment_period 
          SET 
            actual_amount = expected_amount,
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
    
    -- Insert into installment_histories
    INSERT INTO installment_histories (
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