-- Update credit_history table structure to match the new schema
-- Drop the old table if it exists and recreate with new structure
DROP TABLE IF EXISTS credit_history CASCADE;

-- Create the new credit_history table with the correct structure
CREATE TABLE credit_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_id UUID NOT NULL REFERENCES credits(id),
  transaction_type credit_transaction_type NOT NULL,
  debit_amount NUMERIC DEFAULT 0,
  credit_amount NUMERIC DEFAULT 0,
  description TEXT,
  employee_id UUID REFERENCES employees(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_credit_history_credit_id ON credit_history(credit_id);
CREATE INDEX IF NOT EXISTS idx_credit_history_transaction_type ON credit_history(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_history_created_at ON credit_history(created_at);

-- Add comments for documentation
COMMENT ON TABLE credit_history IS 'Lịch sử giao dịch của hợp đồng tín chấp';
COMMENT ON COLUMN credit_history.debit_amount IS 'Số tiền ghi nợ (tiền ra)';
COMMENT ON COLUMN credit_history.credit_amount IS 'Số tiền ghi có (tiền vào)';
COMMENT ON COLUMN credit_history.description IS 'Mô tả giao dịch';

-- Enable RLS
ALTER TABLE credit_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view credit history from their stores" ON credit_history
  FOR SELECT USING (
    credit_id IN (
      SELECT id FROM credits WHERE store_id IN (
        SELECT store_id FROM employees WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert credit history to their stores" ON credit_history
  FOR INSERT WITH CHECK (
    credit_id IN (
      SELECT id FROM credits WHERE store_id IN (
        SELECT store_id FROM employees WHERE user_id = auth.uid()
      )
    )
  ); 