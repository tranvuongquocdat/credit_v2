-- Update pawn_history table structure to match the new schema
-- The table should already exist with the correct structure, but let's ensure it's correct

-- Check if the table exists and has the correct structure
-- If not, create it with the correct structure
CREATE TABLE IF NOT EXISTS pawn_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pawn_id UUID NOT NULL REFERENCES pawns(id),
  transaction_type pawn_transaction_type NOT NULL,
  debit_amount NUMERIC DEFAULT 0,
  credit_amount NUMERIC DEFAULT 0,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  employee_id UUID REFERENCES employees(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pawn_history_pawn_id ON pawn_history(pawn_id);
CREATE INDEX IF NOT EXISTS idx_pawn_history_transaction_type ON pawn_history(transaction_type);
CREATE INDEX IF NOT EXISTS idx_pawn_history_created_at ON pawn_history(created_at);

-- Add comments for documentation
COMMENT ON TABLE pawn_history IS 'Lịch sử giao dịch của hợp đồng cầm đồ';
COMMENT ON COLUMN pawn_history.debit_amount IS 'Số tiền ghi nợ (tiền ra)';
COMMENT ON COLUMN pawn_history.credit_amount IS 'Số tiền ghi có (tiền vào)';
COMMENT ON COLUMN pawn_history.notes IS 'Ghi chú giao dịch';

-- Enable RLS if not already enabled
ALTER TABLE pawn_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'pawn_history' 
    AND policyname = 'Users can view pawn history from their stores'
  ) THEN
    CREATE POLICY "Users can view pawn history from their stores" ON pawn_history
      FOR SELECT USING (
        pawn_id IN (
          SELECT id FROM pawns WHERE store_id IN (
            SELECT store_id FROM employees WHERE user_id = auth.uid()
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'pawn_history' 
    AND policyname = 'Users can insert pawn history to their stores'
  ) THEN
    CREATE POLICY "Users can insert pawn history to their stores" ON pawn_history
      FOR INSERT WITH CHECK (
        pawn_id IN (
          SELECT id FROM pawns WHERE store_id IN (
            SELECT store_id FROM employees WHERE user_id = auth.uid()
          )
        )
      );
  END IF;
END $$; 