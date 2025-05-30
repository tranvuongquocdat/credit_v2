-- Add interest_ui_type and interest_notation columns to pawns table
-- These fields are needed for the interest calculation system

ALTER TABLE pawns 
ADD COLUMN IF NOT EXISTS interest_ui_type TEXT,
ADD COLUMN IF NOT EXISTS interest_notation TEXT;

-- Add comments to explain the purpose of these columns
COMMENT ON COLUMN pawns.interest_ui_type IS 'UI interest type: daily, monthly_30, weekly_percent, etc.';
COMMENT ON COLUMN pawns.interest_notation IS 'Interest notation: k_per_million, percent_per_month, etc.';

-- Update existing records to have default values
UPDATE pawns 
SET 
  interest_ui_type = CASE 
    WHEN interest_type = 'fixed_amount' THEN 'daily'
    WHEN interest_type = 'percentage' THEN 'monthly_30'
    ELSE 'daily'
  END,
  interest_notation = CASE 
    WHEN interest_type = 'fixed_amount' THEN 'k_per_million'
    WHEN interest_type = 'percentage' THEN 'percent_per_month'
    ELSE 'k_per_million'
  END
WHERE interest_ui_type IS NULL OR interest_notation IS NULL; 