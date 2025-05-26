-- Add debt_amount column to installments table
ALTER TABLE installments 
ADD COLUMN debt_amount NUMERIC DEFAULT 0 NOT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN installments.debt_amount IS 'Tiền nợ được tính toán khi check/uncheck kỳ đóng tiền. Công thức: nợ + (actual - expected) khi check, nợ - (actual - expected) khi uncheck';

-- Update existing records to have debt_amount = 0
UPDATE installments SET debt_amount = 0 WHERE debt_amount IS NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_installments_debt_amount ON installments(debt_amount);

-- Update the installments_by_store view to include the new debt_amount column
DROP VIEW IF EXISTS installments_by_store;

CREATE OR REPLACE VIEW installments_by_store AS
SELECT 
  i.*,
  e.store_id
FROM 
  installments i
JOIN 
  employees e ON i.employee_id = e.id; 