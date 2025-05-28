-- Add debt_amount column to credits table
ALTER TABLE public.credits 
ADD COLUMN debt_amount NUMERIC DEFAULT 0 NOT NULL;

-- Add comment for the new column
COMMENT ON COLUMN public.credits.debt_amount IS 'Tiền nợ được tính toán khi check/uncheck kỳ đóng lãi phí. Công thức: nợ + (actual - expected) khi check, nợ - (actual - expected) khi uncheck';

-- Update existing records to have debt_amount = 0
UPDATE public.credits SET debt_amount = 0 WHERE debt_amount IS NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_credits_debt_amount ON public.credits(debt_amount);

-- Create a function to calculate and update debt_amount for existing credits
CREATE OR REPLACE FUNCTION calculate_existing_credit_debt_amounts() 
RETURNS void AS $$
DECLARE
    credit_record RECORD;
    total_expected NUMERIC;
    total_actual NUMERIC;
    debt_amount NUMERIC;
BEGIN
    -- Loop through all active credits
    FOR credit_record IN 
        SELECT id FROM public.credits 
        WHERE status IN ('on_time', 'overdue', 'late_interest', 'bad_debt')
    LOOP
        -- Calculate total expected and actual amounts
        SELECT 
            COALESCE(SUM(expected_amount), 0),
            COALESCE(SUM(actual_amount), 0)
        INTO total_expected, total_actual
        FROM public.credit_payment_periods 
        WHERE credit_id = credit_record.id;
        
        -- Calculate debt amount (actual - expected, negative means debt)
        debt_amount := total_actual - total_expected;
        
        -- Update the credit with calculated debt amount
        UPDATE public.credits 
        SET debt_amount = debt_amount 
        WHERE id = credit_record.id;
        
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the function to populate existing debt amounts
SELECT calculate_existing_credit_debt_amounts();

-- Drop the function after use
DROP FUNCTION calculate_existing_credit_debt_amounts(); 